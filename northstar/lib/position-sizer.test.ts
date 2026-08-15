import assert from "node:assert/strict";
import test from "node:test";
import { deriveSize, preTradeChecks, sizerVerdict, type SizerInput } from "./position-sizer";

const base: SizerInput = {
  familyNavAud: 1_000_000,
  riskPercent: 1,
  entryAud: 10,
  invalidationAud: 8,
  availableCashAud: 100_000,
  themeValueAud: 100_000,
  themeTargetPercent: 30,
  maxPositionPercent: 20,
};

test("size is dollars at risk divided by stop distance", () => {
  const result = deriveSize(base);

  assert.equal(result.riskBudgetAud, 10_000, "1% of a 1m NAV");
  assert.equal(result.stopDistanceAud, 2);
  assert.equal(result.stopDistancePercent, 20);
  assert.equal(result.units, 5_000, "10,000 at risk over a $2 stop");
  assert.equal(result.positionValueAud, 50_000);
  assert.equal(result.positionPercentOfNav, 5);
});

test("a wider stop buys fewer units for the same risk", () => {
  const wide = deriveSize({ ...base, invalidationAud: 5 });
  const tight = deriveSize({ ...base, invalidationAud: 9 });

  assert.equal(wide.units, 2_000, "a $5 stop takes a smaller position");
  assert.equal(tight.units, 10_000, "a $1 stop takes a larger one");
  // The risk given up is identical either way — that is the point of the method.
  assert.equal(wide.riskBudgetAud, tight.riskBudgetAud);
});

test("an invalidation at or above entry cannot produce a size", () => {
  for (const invalidation of [10, 12]) {
    const result = deriveSize({ ...base, invalidationAud: invalidation });
    assert.equal(result.sizeable, false);
    assert.match(result.blocker ?? "", /below the entry price/);
    assert.equal(result.units, 0);
  }
});

test("missing inputs are reported rather than silently sized", () => {
  assert.match(deriveSize({ ...base, entryAud: 0 }).blocker ?? "", /Entry price/);
  assert.match(deriveSize({ ...base, invalidationAud: 0 }).blocker ?? "", /technical invalidation/);
  assert.match(deriveSize({ ...base, riskPercent: 0 }).blocker ?? "", /Risk budget is zero/);
});

test("units are whole, and a budget below one unit is not a position", () => {
  const result = deriveSize({ ...base, familyNavAud: 1_000, riskPercent: 0.1, entryAud: 10, invalidationAud: 9 });

  assert.equal(result.units, 1);
  const none = deriveSize({ ...base, familyNavAud: 100, riskPercent: 0.1, entryAud: 10, invalidationAud: 9 });
  assert.equal(none.units, 0);
  assert.equal(none.sizeable, false);
  assert.match(none.blocker ?? "", /smaller than one unit/);
});

test("a position larger than available cash is blocked, not warned", () => {
  const input = { ...base, availableCashAud: 10_000 };
  const checks = preTradeChecks(input, deriveSize(input));
  const liquidity = checks.find((check) => check.key === "liquidity");

  assert.equal(liquidity?.tone, "bad");
  assert.equal(sizerVerdict(checks, deriveSize(input)).armable, false);
});

test("the single-position ceiling blocks an oversized trade", () => {
  const input = { ...base, riskPercent: 10, availableCashAud: 10_000_000, maxPositionPercent: 20 };
  const result = deriveSize(input);
  const weight = preTradeChecks(input, result).find((check) => check.key === "weight");

  assert.equal(result.positionPercentOfNav, 50);
  assert.equal(weight?.tone, "bad");
});

test("theme exposure warns rather than blocks, and says so when no target exists", () => {
  const over = { ...base, themeValueAud: 295_000 };
  const overCheck = preTradeChecks(over, deriveSize(over)).find((check) => check.key === "theme");
  assert.equal(overCheck?.tone, "warning");
  assert.equal(overCheck?.status, "Over target");

  const untargeted = { ...base, themeTargetPercent: null };
  const untargetedCheck = preTradeChecks(untargeted, deriveSize(untargeted)).find((check) => check.key === "theme");
  assert.equal(untargetedCheck?.status, "No target");
});

test("a clean trade is armable and a cautioned one still is", () => {
  const clean = sizerVerdict(preTradeChecks(base, deriveSize(base)), deriveSize(base));
  assert.equal(clean.armable, true);
  assert.match(clean.text, /All pre-trade checks pass/);

  // Over-target theme exposure is a judgement call, so it cautions without blocking.
  const overTheme = { ...base, themeValueAud: 295_000 };
  const cautioned = sizerVerdict(preTradeChecks(overTheme, deriveSize(overTheme)), deriveSize(overTheme));
  assert.equal(cautioned.armable, true);
  assert.match(cautioned.text, /1 caution/);
});

test("a tight stop cautions on its own, but its derived size can still hard-block", () => {
  // A 0.5% stop turns a 1% risk budget into a $2m position, which trips cash and the weight cap.
  const tight = { ...base, invalidationAud: 9.95 };
  const result = deriveSize(tight);
  const checks = preTradeChecks(tight, result);

  assert.equal(checks.find((check) => check.key === "invalidation")?.status, "Very tight");
  assert.equal(checks.find((check) => check.key === "invalidation")?.tone, "warning");
  assert.equal(sizerVerdict(checks, result).armable, false, "blocked by cash and weight, not by the stop itself");
});

test("checks carry the magnitude, not just a verdict", () => {
  const checks = preTradeChecks(base, deriveSize(base));
  const byKey = new Map(checks.map((check) => [check.key, check]));

  // $50k position against $100k deployable — half the bar.
  assert.equal(byKey.get("liquidity")?.ratio, 0.5);
  // 5% of NAV against a 20% ceiling — a quarter.
  assert.equal(byKey.get("weight")?.ratio, 0.25);
  // 15% theme exposure after the trade against a 30% target.
  assert.equal(byKey.get("theme")?.ratio, 0.5);
  assert.ok((byKey.get("liquidity")?.limitLabel ?? "").includes("deployable"));
});

test("a breach reads above 1 so the bar can show the overshoot", () => {
  const over = { ...base, availableCashAud: 25_000 };
  const liquidity = preTradeChecks(over, deriveSize(over)).find((check) => check.key === "liquidity");

  assert.equal(liquidity?.ratio, 2, "a $50k position on $25k cash is double the limit");
  assert.equal(liquidity?.tone, "bad");
});

test("a check with no limit to measure against reports no ratio", () => {
  const untargeted = { ...base, themeTargetPercent: null };
  const theme = preTradeChecks(untargeted, deriveSize(untargeted)).find((check) => check.key === "theme");

  assert.equal(theme?.ratio, null);
  assert.equal(theme?.limitLabel, null);
});
