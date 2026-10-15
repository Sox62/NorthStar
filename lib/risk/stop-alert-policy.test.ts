import assert from "node:assert/strict";
import test from "node:test";
import { deliverStopAlerts, stopAlertCandidate, stopAlertSeverity, type StopAlertEvent, type StopAlertRepository } from "./stop-alert-policy";
import type { StopRiskRow } from "./stops-types";

const now = new Date("2026-10-15T10:00:00Z");
const row = (stop = 95): StopRiskRow => ({
  positionId: "position-1", ownerType: "PERSONAL", broker: "IBKR", accountKey: "account-1",
  instrumentKey: "instrument-1", symbol: "TEST", currency: "USD", quantity: 100,
  currentPrice: 100, plannedStopPrice: stop, stopType: "STRUCTURAL", priceAsOfDate: "2026-10-15",
  name: "Test position", exchange: "US", sector: "Broad equities", averageCostAud: 100,
  currentPriceAud: 150, marketValueAud: 15_000, plannedStopPriceAud: stop * 1.5,
  plannedTargetPrice: null, riskFromEntryAud: null, riskFromCurrentAud: null,
  riskPercentNav: null, riskPercentPosition: null, targetRewardAud: null, rewardRiskRatio: null,
  rationale: null, invalidationNotes: null, reviewStatus: null, updatedAt: null, exceptions: [],
  sectorRelativeStrength: { benchmarkSymbol: null, status: "NO_BENCHMARK", relativeReturnPercent: null, stockReturnPercent: null, benchmarkReturnPercent: null, observationDays: null },
  brokerStop: { status: "PLAN_ONLY", brokerStopPrice: null, activeStopCount: 0, brokerStopQuantity: 0, brokerStopAsOfDate: null, matchedOrderIds: [] },
} as StopRiskRow);

function memoryRepository() {
  const data = new Map<string, StopAlertEvent>();
  const repository: StopAlertRepository = {
    events: async key => [...data.values()].filter(event => event.seriesKey === key),
    prepare: async event => { if (!data.has(event.id)) data.set(event.id, structuredClone(event)); return structuredClone(data.get(event.id)!); },
    sent: async id => { data.get(id)!.status = "sent"; },
    review: async id => { data.get(id)!.status = "review"; },
  };
  return { data, repository };
}

test("alerts include the exact 5%, 2% and breach boundaries", () => {
  assert.deepEqual([5.01, 5, 2.01, 2, 0.01, 0, -1, NaN].map(stopAlertSeverity), [null, 1, 1, 2, 2, 3, 3, null]);
});

test("old, missing, future prices and stale broker imports do not produce emails", () => {
  for (const date of [null, "2026-10-11", "2026-10-16", "bad"]) {
    assert.equal(stopAlertCandidate({ ...row(), priceAsOfDate: date }, "test@example.com", now), null);
  }
  assert.ok(stopAlertCandidate({ ...row(), priceAsOfDate: "2026-10-12" }, "test@example.com", now));
  assert.equal(stopAlertCandidate({ ...row(), currentPrice: null }, "test@example.com", now), null);
  assert.equal(stopAlertCandidate({ ...row(), brokerStop: { ...row().brokerStop, brokerStopPrice: 99, status: "STALE", brokerStopAsOfDate: "2026-10-15" } }, "test@example.com", now), null);
});

test("persisted state sends only warning, escalation and breach, including after a restart or recovery", async () => {
  const { repository } = memoryRepository();
  const sent: string[] = [];
  const send = async (_email: unknown, key: string) => { sent.push(key); return "provider-id"; };
  const run = (price: number) => deliverStopAlerts([{ ...row(95), currentPrice: price }], "test@example.com", "SS <alerts@example.com>", repository, send, now);
  await run(100); await run(100); await run(110); await run(100); await run(96); await run(97); await run(94); await run(94);
  assert.equal(sent.length, 3);
  assert.equal(new Set(sent).size, 3);
});

test("new stop levels and account identities retain separate alert histories", () => {
  const key = stopAlertCandidate(row(), "test@example.com", now)!.seriesKey;
  for (const input of [row(96), { ...row(), ownerType: "SMSF" as const }, { ...row(), accountKey: "other" }]) {
    assert.notEqual(stopAlertCandidate(input, "test@example.com", now)!.seriesKey, key);
  }
});

test("ambiguous delivery retries use identical content and idempotency key; retries stop before provider expiry", async () => {
  const { repository, data } = memoryRepository();
  const attempts: string[] = [];
  const send = async (email: unknown, key: string) => { attempts.push(JSON.stringify({ email, key })); throw new Error("timeout"); };
  const run = (date: Date, input = row()) => deliverStopAlerts([input], "test@example.com", "SS <alerts@example.com>", repository, send, date);
  await assert.rejects(run(now));
  await assert.rejects(run(new Date(now.getTime() + 3_600_000), { ...row(), currentPrice: 99 }));
  assert.equal(attempts[0], attempts[1]);
  const result = await run(new Date(now.getTime() + 23 * 3_600_000));
  assert.equal(result.review, 1);
  assert.equal(attempts.length, 2);
  assert.equal([...data.values()][0].status, "review");
});

test("a full page of suppressed events does not starve a new alert", async () => {
  const { repository } = memoryRepository();
  let count = 0;
  const send = async () => { count++; return "sent"; };
  const rows = Array.from({ length: 21 }, (_, n) => ({ ...row(), instrumentKey: `instrument-${n}` }));
  await deliverStopAlerts(rows, "test@example.com", "alerts@example.com", repository, send, now);
  assert.equal(count, 20);
  await deliverStopAlerts(rows, "test@example.com", "alerts@example.com", repository, send, now);
  assert.equal(count, 21);
});
