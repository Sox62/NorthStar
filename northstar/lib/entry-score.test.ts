import assert from "node:assert/strict";
import test from "node:test";
import type { RatioHistoryPoint } from "./ratio-engine";
import { scoreEntryCondition } from "./entry-score";

function history(values: number[]): RatioHistoryPoint[] {
  return values.map((close, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    close,
    currency: "AUD",
    fxRateToAud: 1,
    valueAud: close,
    source: "test",
  }));
}

test("scoreEntryCondition rewards a reset near support with improving momentum", () => {
  const values = [
    ...Array.from({ length: 120 }, (_, index) => 80 + index * 0.2),
    ...Array.from({ length: 25 }, (_, index) => 104 - index * 0.6),
    ...Array.from({ length: 20 }, (_, index) => 89 + index * 0.45),
  ];
  const result = scoreEntryCondition(history(values), { relativeIntegrityHealthy: true });

  assert.ok(result.score != null && result.score >= 55, String(result.score));
  assert.equal(result.integrityGateApplied, false);
  assert.ok(result.checks.some((check) => check.key === "rsi_reset"));
});

test("scoreEntryCondition penalises extreme extension above the long average", () => {
  const values = [
    ...Array.from({ length: 150 }, (_, index) => 50 + index * 0.1),
    ...Array.from({ length: 15 }, (_, index) => 80 + index * 5),
  ];
  const result = scoreEntryCondition(history(values), { relativeIntegrityHealthy: true });
  const distance = result.checks.find((check) => check.key === "distance_200dma");

  assert.ok(distance);
  assert.ok(distance!.points < 10, String(distance!.points));
});

test("scoreEntryCondition caps a falling price when relative integrity fails", () => {
  const values = [
    ...Array.from({ length: 140 }, (_, index) => 80 + index * 0.25),
    ...Array.from({ length: 25 }, (_, index) => 115 - index * 1.2),
  ];
  const failed = scoreEntryCondition(history(values), { relativeIntegrityHealthy: false });
  const healthy = scoreEntryCondition(history(values), { relativeIntegrityHealthy: true });

  assert.equal(failed.integrityGateApplied, true);
  assert.ok(failed.score != null && failed.score <= 45, String(failed.score));
  assert.ok((healthy.score ?? 0) >= (failed.score ?? 0));
});

test("scoreEntryCondition returns null without enough stored closes", () => {
  const result = scoreEntryCondition(history([10, 11, 12]), { relativeIntegrityHealthy: true });

  assert.equal(result.score, null);
  assert.equal(result.label, "Not enough history");
});
