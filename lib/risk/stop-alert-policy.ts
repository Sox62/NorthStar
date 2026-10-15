import { createHash } from "node:crypto";
import { stopProximity } from "./stop-proximity";
import type { StopRiskRow } from "./stops-types";

export type StopAlertSeverity = 1 | 2 | 3;
export type StopAlertCandidate = {
  seriesKey: string;
  severity: StopAlertSeverity;
  symbol: string;
  owner: string;
  currency: string;
  currentPrice: number;
  stopPrice: number;
  distancePercent: number;
  source: string;
  priceDate: string;
  brokerDate: string | null;
};

export const stopAlertLabels = { 1: "Stop approaching", 2: "Urgent: stop approaching", 3: "Stop level reached or breached" } as const;

export function stopAlertSeverity(distancePercent: number | null): StopAlertSeverity | null {
  if (distancePercent == null || !Number.isFinite(distancePercent)) return null;
  return distancePercent <= 0 ? 3 : distancePercent <= 2 ? 2 : distancePercent <= 5 ? 1 : null;
}

function currentDate(date: string | null | undefined, now: Date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const time = Date.parse(`${date}T00:00:00Z`);
  const calendarDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const today = Date.parse(`${calendarDate}T00:00:00Z`);
  // Three calendar days accommodates a weekend. Never alert on future or older records.
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date && time <= today && today - time <= 3 * 86_400_000;
}

export function stopAlertCandidate(row: StopRiskRow, recipient: string, now: Date): StopAlertCandidate | null {
  const proximity = stopProximity(row);
  const severity = stopAlertSeverity(proximity.distancePercent);
  if (!severity || row.quantity <= 0 || !currentDate(row.priceAsOfDate, now)) return null;
  if (proximity.source === "Broker stop" && (row.brokerStop.status === "STALE" || !currentDate(row.brokerStop.brokerStopAsOfDate, now))) return null;
  const seriesKey = createHash("sha256").update(JSON.stringify([
    recipient.toLowerCase(), row.ownerType, row.broker.toUpperCase(), row.accountKey,
    row.instrumentKey, row.currency, proximity.source, proximity.stopPrice,
  ])).digest("hex");
  return {
    seriesKey, severity, symbol: row.symbol, owner: row.ownerType, currency: row.currency,
    currentPrice: row.currentPrice!, stopPrice: proximity.stopPrice!, distancePercent: proximity.distancePercent!,
    source: proximity.source, priceDate: row.priceAsOfDate!, brokerDate: row.brokerStop.brokerStopAsOfDate,
  };
}

export type StopAlertEmail = { from: string; to: string[]; subject: string; text: string };

export function stopAlertEmail(candidate: StopAlertCandidate, from: string, recipient: string, checkedAt: Date): StopAlertEmail {
  const c = candidate;
  return {
    from, to: [recipient], subject: `SouthernStar — ${stopAlertLabels[c.severity]}: ${c.symbol}`,
    text: [
      `${c.symbol} (${c.owner}) — ${stopAlertLabels[c.severity]}`,
      `Recorded price: ${c.currency} ${c.currentPrice} (dated ${c.priceDate})`,
      `${c.source}: ${c.currency} ${c.stopPrice}${c.source === "Broker stop" ? ` (import dated ${c.brokerDate})` : ""}`,
      `Room to level: ${c.distancePercent.toFixed(2)}% of the recorded current price.`,
      `Checked: ${checkedAt.toISOString()}`,
      "", "This is a check of recorded prices, not a real-time price feed or confirmation of execution.",
      "Warnings occur at 5%, 2%, and at/below the level. Only an escalation sends another email for this level.",
      "Manage alerts in SouthernStar → Stops & Orders.",
    ].join("\n"),
  };
}

export type StopAlertEvent = {
  id: string; seriesKey: string; severity: number; status: "pending" | "sent" | "review";
  createdAt: string; email: StopAlertEmail;
};
export interface StopAlertRepository {
  events(seriesKey: string): Promise<StopAlertEvent[]>;
  prepare(event: StopAlertEvent): Promise<StopAlertEvent>;
  sent(id: string, providerId: string): Promise<void>;
  review(id: string): Promise<void>;
}

export async function deliverStopAlerts(
  rows: StopRiskRow[], recipient: string, from: string, repository: StopAlertRepository,
  send: (email: StopAlertEmail, idempotencyKey: string) => Promise<string>, now = new Date(),
) {
  const result = { sent: 0, suppressed: 0, review: 0 };
  const candidates = rows.map(row => stopAlertCandidate(row, recipient, now))
    .filter((c): c is StopAlertCandidate => c !== null).sort((a, b) => b.severity - a.severity);
  let attempts = 0;
  for (const candidate of candidates) {
    const previous = await repository.events(candidate.seriesKey);
    if (previous.some(event => event.severity >= candidate.severity && event.status !== "pending")
      || previous.some(event => event.severity > candidate.severity)) { result.suppressed++; continue; }
    if (attempts++ >= 20) break;
    const event = await repository.prepare({
      id: `ss-stop-${candidate.seriesKey}-${candidate.severity}`, seriesKey: candidate.seriesKey,
      severity: candidate.severity, status: "pending", createdAt: now.toISOString(),
      email: stopAlertEmail(candidate, from, recipient, now),
    });
    // Resend keeps idempotency keys for 24 hours. Avoid an ambiguous retry after that window.
    if (now.getTime() - Date.parse(event.createdAt) >= 23 * 3_600_000) {
      await repository.review(event.id); result.review++; continue;
    }
    const providerId = await send(event.email, event.id);
    await repository.sent(event.id, providerId);
    result.sent++;
  }
  return result;
}
