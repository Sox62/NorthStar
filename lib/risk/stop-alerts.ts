import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import { sendStopAlertEmail, stopEmailProviderReady } from "@/lib/integrations/stop-alert-email";
import { getStorage, type StorageAdapter } from "@/lib/storage";
import { buildStopsRiskDashboard } from "./stops";
import { deliverStopAlerts, type StopAlertEvent, type StopAlertRepository } from "./stop-alert-policy";

export type StopAlertStatus = {
  available: boolean; providerReady: boolean; recipient: string; enabled: boolean;
  lastSentAt: string | null; reviewCount: number; pendingCount: number;
};

export async function getStopAlertStatus(): Promise<StopAlertStatus> {
  const base = { available: Boolean(process.env.DATABASE_URL), providerReady: stopEmailProviderReady(), recipient: "", enabled: false, lastSentAt: null, reviewCount: 0, pendingCount: 0 };
  if (!base.available) return base;
  const pool = getPool();
  const result = await pool.query(`SELECT recipient, enabled FROM stop_alert_settings WHERE id = 'default'`);
  const row = result.rows[0];
  const history = await pool.query(`SELECT MAX(sent_at) AS last_sent_at, COUNT(*) FILTER (WHERE status = 'review')::int AS review_count,
    COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count FROM stop_alert_events`);
  return { ...base, recipient: row?.recipient ?? "", enabled: row?.enabled ?? false,
    lastSentAt: history.rows[0]?.last_sent_at?.toISOString() ?? null, reviewCount: history.rows[0]?.review_count ?? 0, pendingCount: history.rows[0]?.pending_count ?? 0 };
}

export async function saveStopAlertSettings(recipient: string, enabled: boolean) {
  if (!process.env.DATABASE_URL) throw new Error("Email alerts need PostgreSQL to retain delivery history.");
  if (enabled && !stopEmailProviderReady()) throw new Error("Configure the email sender before enabling alerts.");
  // Serialize a recipient change or disable with any delivery already in progress.
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock(742861, 1)");
    await client.query(`INSERT INTO stop_alert_settings (id,recipient,enabled) VALUES ('default',$1,$2)
      ON CONFLICT (id) DO UPDATE SET recipient=$1,enabled=$2,updated_at=now()`, [recipient, enabled]);
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(742861, 1)"); } finally { client.release(); }
  }
  return getStopAlertStatus();
}

function repository(client: PoolClient): StopAlertRepository {
  const parse = (row: Record<string, unknown>): StopAlertEvent => ({
    id: String(row.id), seriesKey: String(row.series_key), severity: Number(row.severity),
    status: row.status as StopAlertEvent["status"], createdAt: new Date(String(row.created_at)).toISOString(),
    email: row.email as StopAlertEvent["email"],
  });
  return {
    events: async key => (await client.query("SELECT * FROM stop_alert_events WHERE series_key=$1", [key])).rows.map(parse),
    prepare: async event => {
      await client.query(`INSERT INTO stop_alert_events (id,series_key,severity,status,email,created_at) VALUES ($1,$2,$3,'pending',$4,$5) ON CONFLICT (id) DO NOTHING`,
        [event.id, event.seriesKey, event.severity, JSON.stringify(event.email), event.createdAt]);
      return parse((await client.query("SELECT * FROM stop_alert_events WHERE id=$1", [event.id])).rows[0]);
    },
    sent: async (id, providerId) => { await client.query("UPDATE stop_alert_events SET status='sent',provider_id=$2,sent_at=now() WHERE id=$1", [id, providerId]); },
    review: async id => { await client.query("UPDATE stop_alert_events SET status='review' WHERE id=$1", [id]); },
  };
}

export async function checkStopEmailAlerts(storage: StorageAdapter = getStorage()) {
  if (!process.env.DATABASE_URL || !stopEmailProviderReady()) return { status: "disabled" };
  const client = await getPool().connect();
  let locked = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(742861, 1) AS locked")).rows[0].locked;
    if (!locked) return { status: "busy" };
    const settings = (await client.query("SELECT recipient,enabled FROM stop_alert_settings WHERE id='default'")).rows[0];
    if (!settings?.enabled || !settings.recipient) return { status: "disabled" };
    const dashboard = await buildStopsRiskDashboard(storage, "overall");
    const result = await deliverStopAlerts(dashboard.rows, settings.recipient, process.env.STOP_ALERT_EMAIL_FROM!.trim(), repository(client), async (email, key) => {
      const id = await sendStopAlertEmail(email, key);
      // Stay below the provider's default two requests per second.
      await new Promise(resolve => setTimeout(resolve, 600));
      return id;
    });
    return { status: "checked", ...result };
  } finally {
    try { if (locked) await client.query("SELECT pg_advisory_unlock(742861, 1)"); } finally { client.release(); }
  }
}
