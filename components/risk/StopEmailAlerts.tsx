"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { StopAlertStatus } from "@/lib/risk/stop-alerts";
import styles from "./StopsOrdersDashboard.module.css";

export default function StopEmailAlerts() {
  const [status, setStatus] = useState<StopAlertStatus | null>(null);
  const [recipient, setRecipient] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/risk/alerts", { cache: "no-store" }).then(async response => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      if (!cancelled) { setStatus(value); setRecipient(value.recipient); setEnabled(value.enabled); }
    }).catch(() => { if (!cancelled) setMessage("Unable to load email alert settings."); });
    return () => { cancelled = true; };
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/risk/alerts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient, enabled }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setStatus(value); setMessage(value.enabled ? "Email alerts enabled." : "Recipient saved. Email alerts are off.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save alerts."); }
    finally { setSaving(false); }
  }
  return <details className={styles.emailAlerts}>
    <summary>Email alerts · {status?.enabled && status.providerReady ? "On" : "Off"}</summary>
    <p>Warnings at 5%, urgent at 2%, and at/below the level. Repeats are suppressed unless the warning escalates. Personal and SMSF positions are included.</p>
    <p>Checked after scheduled or manual price refreshes using recorded prices. Quotes and broker stop imports older than three days are skipped.</p>
    {status ? <form onSubmit={save}>
      <label>Alert recipient<input type="email" value={recipient} onChange={event => setRecipient(event.target.value)} required maxLength={254} disabled={!status.available} /></label>
      <label className={styles.alertToggle}><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={!status.available || (!status.providerReady && !enabled)} />Enable stop email alerts</label>
      <p>{!status.available ? "Email alerts require database storage." : !status.providerReady ? "Sender setup is pending. You can save a recipient while alerts stay off." : "Email sender configured."}</p>
      {status.lastSentAt ? <p>Last email accepted: {new Date(status.lastSentAt).toLocaleString("en-AU")}</p> : null}
      {status.pendingCount ? <p>{status.pendingCount} email attempt(s) awaiting a confirmed provider response.</p> : null}
      {status.reviewCount ? <p role="alert">{status.reviewCount} delivery attempt(s) need review; automatic retries have stopped to prevent duplicates.</p> : null}
      <button className="button secondary" type="submit" disabled={saving || !status.available}>{saving ? "Saving…" : "Save email alerts"}</button>
    </form> : null}
    <p role="status">{message}</p>
  </details>;
}
