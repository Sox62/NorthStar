import assert from "node:assert/strict";
import test from "node:test";
import { stopProximity } from "./stop-proximity";

const row = (currentPrice: number | null, plannedStopPrice: number | null, brokerStopPrice: number | null = null) => ({
  currentPrice, plannedStopPrice, stopType: "STRUCTURAL" as const,
  brokerStop: { status: "PROTECTED" as const, activeStopCount: 1, brokerStopPrice, brokerStopQuantity: 100, brokerStopAsOfDate: "2026-10-15", matchedOrderIds: ["1"] },
});

test("uses the actual broker trigger even when the plan differs", () => {
  const result = stopProximity(row(100, 80, 97));
  assert.equal(result.source, "Broker stop");
  assert.equal(result.distancePercent, 3);
  assert.equal(result.tone, "danger");
  assert.equal(result.fillPercent, 20);
});

test("thresholds measure the fall from current price, not percentage above stop", () => {
  assert.equal(stopProximity(row(100, 90)).tone, "warning");
  assert.equal(stopProximity(row(100, 95)).tone, "warning");
  assert.equal(stopProximity(row(100, 95.01)).tone, "danger");
  assert.equal(stopProximity(row(100, 89.99)).tone, "good");
  assert.equal(stopProximity(row(100, 70)).fillPercent, 100);
});

test("a level reached or breached empties the tank without asserting an execution", () => {
  assert.equal(stopProximity(row(100, 100)).tone, "breached");
  const result = stopProximity(row(90, 100));
  assert.ok(result.distancePercent! < 0);
  assert.equal(result.fillPercent, 0);
});

test("missing and invalid prices never render as a healthy stop", () => {
  for (const input of [row(null, 90), row(0, 90), row(NaN, 90), row(100, null), row(100, -1), row(100, Infinity)]) {
    assert.equal(stopProximity(input).tone, "unknown");
  }
  assert.equal(stopProximity({ ...row(100, 90), stopType: "MANUAL_REVIEW" }).source, "Review level");
});
