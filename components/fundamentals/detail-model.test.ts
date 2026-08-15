import assert from "node:assert/strict";
import test from "node:test";
import type { MinerFundamentals } from "@/lib/storage";
import { enterpriseValueAud, failureModes, netCashAud, riskLevel, valuationRows } from "./detail-model";

const base: MinerFundamentals = {
  symbol: "AYA",
  name: "Aya Gold & Silver",
  primaryMetal: "Silver",
  jurisdiction: "Morocco",
  projectStage: "Producing",
  productionOz: 3_200_000,
  aiscUsdPerOz: 14.2,
  resourceMoz: 120,
  reserveMoz: 40,
  cashAud: 50_000_000,
  debtAud: 20_000_000,
  marketCapAud: 900_000_000,
  npvAud: 1_400_000_000,
  capexAud: 300_000_000,
  irrPercent: 32,
  jurisdictionScore: 3,
  balanceSheetScore: 4,
  dilutionScore: 4,
  managementScore: 4,
  notes: "Restart thesis",
  sourceUrl: null,
  asOfDate: "2026-08-01",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

test("riskLevel maps the 0-5 research scores onto severities", () => {
  assert.deepEqual(riskLevel(5), { level: "Low", tone: "good" });
  assert.deepEqual(riskLevel(3), { level: "Moderate", tone: "warning" });
  assert.deepEqual(riskLevel(0), { level: "High", tone: "bad" });
  assert.deepEqual(riskLevel(null), { level: "Not scored", tone: "warning" });
});

test("net cash and enterprise value follow cash and debt", () => {
  assert.equal(netCashAud(base), 30_000_000);
  assert.equal(enterpriseValueAud(base), 900_000_000 + 20_000_000 - 50_000_000);
  assert.equal(netCashAud(undefined), null);
  assert.equal(enterpriseValueAud({ ...base, marketCapAud: null }), null);
});

test("risked NPV applies probability then haircut, and re-rates against enterprise value", () => {
  const rows = valuationRows({ fundamentals: base, probability: 0.5, haircutPercent: 50 });
  const risked = rows.find((row) => row.key === "risked");
  const reRating = rows.find((row) => row.key === "rerating");

  // 1.4bn x 0.5 x 0.5 = 350m against an 870m enterprise value.
  assert.equal(risked?.value, "$350,000,000");
  assert.equal(reRating?.value, "−60%");
  assert.equal(reRating?.tone, "negative");
});

test("a risked NPV above enterprise value reads as upside", () => {
  const rows = valuationRows({ fundamentals: base, probability: 1, haircutPercent: 0 });
  const reRating = rows.find((row) => row.key === "rerating");

  assert.equal(reRating?.tone, "positive");
  assert.ok(reRating?.value.startsWith("+"));
});

test("probability and haircut are clamped to sane bounds", () => {
  const high = valuationRows({ fundamentals: base, probability: 5, haircutPercent: -20 });
  const low = valuationRows({ fundamentals: base, probability: -1, haircutPercent: 500 });

  assert.equal(high.find((row) => row.key === "risked")?.value, "$1,400,000,000", "probability caps at 1, haircut at 0");
  assert.equal(low.find((row) => row.key === "risked")?.value, "$0", "probability floors at 0");
});

test("missing NPV yields dashes rather than a fabricated valuation", () => {
  const rows = valuationRows({ fundamentals: { ...base, npvAud: null }, probability: 0.6, haircutPercent: 35 });

  assert.equal(rows.find((row) => row.key === "risked")?.value, "-");
  assert.equal(rows.find((row) => row.key === "rerating")?.value, "-");
});

test("failure modes are derived only from recorded inputs", () => {
  assert.deepEqual(failureModes(undefined), [], "an unresearched holding invents nothing");
  assert.deepEqual(failureModes(base), [], "a well-scored company flags nothing");

  const weak = failureModes({ ...base, jurisdictionScore: 1, balanceSheetScore: 2 });
  assert.equal(weak.length, 2);
  assert.ok(weak[0].includes("Jurisdiction"));
  assert.ok(weak[1].includes("Balance sheet"));
});

test("capex beyond enterprise value is flagged as a funding gap", () => {
  const modes = failureModes({ ...base, capexAud: 2_000_000_000 });

  assert.ok(modes.some((mode) => mode.includes("Capex exceeds enterprise value")));
});
