import assert from "node:assert/strict";
import test from "node:test";
import type { MinerFundamentals } from "@/lib/storage";
import { enterpriseValueAud, failureModes, fundamentalBars, netCashAud, riskLevel, valuationBars, valuationRows } from "./detail-model";
import { researchFormForHolding, researchFormForIdea } from "./model";
import type { Holding } from "@/northstar/types";

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
  assert.deepEqual(riskLevel(5), { level: "Low", tone: "good", score: 1 });
  assert.deepEqual(riskLevel(3), { level: "Moderate", tone: "warning", score: 0.6 });
  assert.deepEqual(riskLevel(0), { level: "High", tone: "bad", score: 0 });
  assert.deepEqual(riskLevel(null), { level: "Not scored", tone: "warning", score: null });
});

test("the score is normalised for drawing and clamped to the 0-5 scale", () => {
  // The bar reads as a fraction of the scale, so an out-of-range entry cannot overflow it.
  assert.equal(riskLevel(4)?.score, 0.8);
  assert.equal(riskLevel(9)?.score, 1);
  assert.equal(riskLevel(-2)?.score, 0);
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

test("researchFormForHolding round-trips a saved record so an edit cannot blank it", () => {
  const holding = { symbol: "aya", name: "Aya Gold & Silver" } as Holding;
  const form = researchFormForHolding(holding, base);

  assert.equal(form.symbol, "AYA", "the symbol comes from the holding, so it always matches the queue");
  assert.equal(form.npvAud, "1400000000");
  assert.equal(form.marketCapAud, "900000000");
  assert.equal(form.jurisdictionScore, "3");
  assert.equal(form.asOfDate, "2026-08-01");
  assert.equal(form.notes, "Restart thesis");
});

test("researchFormForIdea loads a saved research record for editing", () => {
  const form = researchFormForIdea({ ...base, symbol: "paas" });

  assert.equal(form.symbol, "PAAS");
  assert.equal(form.name, "Aya Gold & Silver");
  assert.equal(form.productionOz, "3200000");
  assert.equal(form.aiscUsdPerOz, "14.2");
  assert.equal(form.marketCapAud, "900000000");
  assert.equal(form.jurisdictionScore, "3");
  assert.equal(form.asOfDate, "2026-08-01");
  assert.equal(form.notes, "Restart thesis");
});

test("researchFormForHolding seeds a blank form from the holding when nothing is saved", () => {
  const holding = { symbol: "wrn", name: "Western Copper & Gold" } as Holding;
  const form = researchFormForHolding(holding, undefined);

  assert.equal(form.symbol, "WRN");
  assert.equal(form.name, "Western Copper & Gold");
  assert.equal(form.npvAud, "");
  assert.equal(form.jurisdictionScore, "");
});

test("valuation bars share one scale so the comparison is visual", () => {
  const bars = valuationBars({ fundamentals: base, probability: 0.5, haircutPercent: 50 });
  const byKey = new Map(bars.map((bar) => [bar.key, bar]));

  // NPV 1.4bn is the largest, so it anchors the scale at 1.
  assert.equal(byKey.get("npv")?.ratio, 1);
  // Risked 350m and EV 870m are drawn as fractions of it.
  assert.equal(byKey.get("risked")?.ratio, 0.25);
  assert.equal(Number(byKey.get("ev")?.ratio.toFixed(4)), Number((870_000_000 / 1_400_000_000).toFixed(4)));
});

test("risked NPV reads positive only when it clears what the market already pays", () => {
  const under = valuationBars({ fundamentals: base, probability: 0.5, haircutPercent: 50 });
  assert.equal(under.find((bar) => bar.key === "risked")?.tone, "negative");

  const over = valuationBars({ fundamentals: base, probability: 1, haircutPercent: 0 });
  assert.equal(over.find((bar) => bar.key === "risked")?.tone, "positive");
});

test("no valuation inputs draws nothing rather than an empty scale", () => {
  assert.deepEqual(valuationBars({ fundamentals: undefined, probability: 0.6, haircutPercent: 35 }), []);
  const bare = { ...base, npvAud: null, marketCapAud: null };
  assert.deepEqual(valuationBars({ fundamentals: bare, probability: 0.6, haircutPercent: 35 }), []);
});

test("relational bars express conversion, balance and funding cover", () => {
  const bars = fundamentalBars(base);
  const byKey = new Map(bars.map((bar) => [bar.key, bar]));

  // 40 of 120 Moz proven.
  assert.equal(byKey.get("conversion")?.display, "33%");
  assert.equal(byKey.get("conversion")?.tone, "positive");
  assert.equal(byKey.get("debt")?.tone, "muted", "debt below cash is not a negative");
  assert.equal(byKey.get("debt")?.note, "covered by cash");
  assert.equal(byKey.get("capex")?.display, "2.90x");
});

test("debt above cash reads negative", () => {
  const geared = fundamentalBars({ ...base, cashAud: 10_000_000, debtAud: 90_000_000 });
  const debt = geared.find((bar) => bar.key === "debt");

  assert.equal(debt?.tone, "negative");
  assert.equal(debt?.note, "exceeds cash");
});

test("an unresearched holding draws no relational bars", () => {
  assert.deepEqual(fundamentalBars(undefined), []);
});
