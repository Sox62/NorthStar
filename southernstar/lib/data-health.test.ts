import assert from "node:assert/strict";
import test from "node:test";
import { dataHealth } from "./data-health";

const allSourcesReporting = [
  { source: "IBKR", status: "success" },
  { source: "Directshares Email", status: "success" },
  { source: "Directshares Dividends", status: "success" },
  { source: "ABC Bullion", status: "success" },
];

const freshValuations = [
  { source: "IBKR positions", status: "fresh" },
  { source: "Cash balances", status: "fresh" },
  { source: "Physical metals", status: "fresh" },
];

test("dataHealth reports current when every source succeeded", () => {
  assert.deepEqual(dataHealth(allSourcesReporting, freshValuations), { tone: "good", label: "Data current" });
});

test("a skipped ABC Bullion retry stays green while the buyback price is still current", () => {
  const runs = allSourcesReporting.map((run) => run.source === "ABC Bullion" ? { ...run, status: "skipped" } : run);

  assert.deepEqual(dataHealth(runs, freshValuations), { tone: "good", label: "Data current" });
});

test("a failing ABC Bullion sync escalates once the buyback price goes stale", () => {
  const runs = allSourcesReporting.map((run) => run.source === "ABC Bullion" ? { ...run, status: "skipped" } : run);
  const staleMetals = freshValuations.map((item) => item.source === "Physical metals" ? { ...item, status: "stale" } : item);

  assert.deepEqual(dataHealth(runs, staleMetals), { tone: "warning", label: "Review sync" });
});

test("a hard failure on a source with no current data still reports an issue", () => {
  const runs = allSourcesReporting.map((run) => run.source === "ABC Bullion" ? { ...run, status: "failed" } : run);
  const missingMetals = freshValuations.map((item) => item.source === "Physical metals" ? { ...item, status: "missing" } : item);

  assert.deepEqual(dataHealth(runs, missingMetals), { tone: "bad", label: "Data issue" });
});

test("a failed sync on a source without fresh output is not masked", () => {
  const runs = allSourcesReporting.map((run) => run.source === "Directshares Email" ? { ...run, status: "failed" } : run);

  assert.deepEqual(dataHealth(runs, freshValuations), { tone: "bad", label: "Data issue" });
});

test("current IBKR positions do not mask a failure from an unrelated source", () => {
  const runs = allSourcesReporting.map((run) => run.source === "IBKR" ? { ...run, status: "failed" } : run);

  assert.deepEqual(dataHealth(runs, freshValuations), { tone: "good", label: "Data current" },
    "IBKR's own failure is excused by current positions");
  assert.deepEqual(dataHealth([...runs, { source: "Market pricing", status: "failed" }], freshValuations),
    { tone: "bad", label: "Data issue" }, "but an unmapped source still escalates");
});

test("a never-reported source still degrades unless its data is current", () => {
  const withoutBullion = allSourcesReporting.filter((run) => run.source !== "ABC Bullion");

  assert.deepEqual(dataHealth(withoutBullion, freshValuations), { tone: "good", label: "Data current" });
  const withoutMetalsFreshness = freshValuations.filter((item) => item.source !== "Physical metals");
  assert.deepEqual(dataHealth(withoutBullion, withoutMetalsFreshness), { tone: "warning", label: "Review sync" });
});
