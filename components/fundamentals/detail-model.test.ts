import assert from "node:assert/strict";
import test from "node:test";
import type { MinerFundamentals } from "@/lib/storage";
import { allocationRead, enterpriseValueAud, failureModes, fundamentalBars, fundamentalQualityScore, fundamentalScoreRead, netCashAud, riskJudgementScore, riskLevel, valuationBars, valuationRead, valuationRows, valuationScore } from "./detail-model";
import { researchFormForHolding, researchFormForIdea } from "./model";
import type { Holding } from "@/southernstar/types";

const base: MinerFundamentals = {
  symbol: "AYA",
  name: "Aya Gold & Silver",
  primaryMetal: "Silver",
  jurisdiction: "Morocco",
  projectStage: "Producing",
  productionOz: 3_200_000,
  aiscUsdPerOz: 14.2,
  quantityUnit: "oz",
  productionPeriod: "year",
  costBasis: "aisc_byproduct",
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

/** Same-metal peers, so cost and scale have a cohort to be judged against. */
const silverPeers: MinerFundamentals[] = [
  { ...base, symbol: "SP1", aiscUsdPerOz: 18, productionOz: 2_000_000 },
  { ...base, symbol: "SP2", aiscUsdPerOz: 22, productionOz: 1_200_000 },
  { ...base, symbol: "SP3", aiscUsdPerOz: 26, productionOz: 900_000 },
];
const cohort: MinerFundamentals[] = [base, ...silverPeers];

const goldMiner: MinerFundamentals = { ...base, symbol: "KGC", primaryMetal: "Gold", aiscUsdPerOz: 1821, productionOz: 2_012_106, npvAud: null };
const goldCohort: MinerFundamentals[] = [
  goldMiner,
  { ...goldMiner, symbol: "G1", aiscUsdPerOz: 1926, productionOz: 1_540_000 },
  { ...goldMiner, symbol: "G2", aiscUsdPerOz: 2103, productionOz: 379_050 },
  { ...goldMiner, symbol: "G3", aiscUsdPerOz: 2088, productionOz: 336_540 },
];

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


test("fundamental score uses the stage model and factual coverage", () => {
  const read = fundamentalScoreRead(base, cohort);

  assert.equal(read.model, "producer");
  assert.equal(read.coverage, 100);
  assert.equal(read.score, 85);
  assert.equal(fundamentalQualityScore(base, cohort), 85);
  assert.equal(riskJudgementScore(base), 3.75);
});

test("cost position is judged against same-metal peers, not a fixed band", () => {
  const read = fundamentalScoreRead(goldMiner, goldCohort);
  const cost = read.parts.find((part) => part.key === "cost");

  // Under the old silver-calibrated bands any AISC above 28 scored 4 of 25, so every gold
  // producer in the book sat at the bottom of the cost curve permanently.
  assert.ok(cost?.score != null && cost.score > 12.5, `gold AISC below its peer median must beat neutral, got ${cost?.score}`);
  assert.match(cost!.note, /4 gold peers/);
  assert.match(cost!.note, /USD\/oz/);
});

test("uranium is scored in its own units rather than against ounce thresholds", () => {
  const uranium: MinerFundamentals = { ...base, symbol: "PDN", primaryMetal: "Uranium", quantityUnit: "lb", aiscUsdPerOz: 43.3, productionOz: 4_820_000 };
  const peers = [uranium, { ...uranium, symbol: "U1", aiscUsdPerOz: 39.09 }, { ...uranium, symbol: "U2", aiscUsdPerOz: 55 }];
  const cost = fundamentalScoreRead(uranium, peers).parts.find((part) => part.key === "cost");

  assert.ok(cost?.score != null);
  assert.match(cost!.note, /USD\/lb/, "uranium is recorded per pound, and the label must say so");
});

test("production is annualised before it is compared", () => {
  // The same mine, one record capturing a quarter and one capturing the full year.
  const quarterly: MinerFundamentals = { ...base, symbol: "Q", productionOz: 1_000_000, productionPeriod: "quarter" };
  const yearly: MinerFundamentals = { ...base, symbol: "Y", productionOz: 4_000_000, productionPeriod: "year" };
  const third: MinerFundamentals = { ...base, symbol: "P3", productionOz: 2_000_000, productionPeriod: "year" };
  const peers = [quarterly, yearly, third];
  const scale = (subject: MinerFundamentals) => fundamentalScoreRead(subject, peers).parts.find((part) => part.key === "production")?.score;

  assert.equal(scale(quarterly), scale(yearly), "a quarter must not be ranked against a year");
  assert.match(fundamentalScoreRead(quarterly, peers).parts.find((part) => part.key === "production")!.note, /4,000,000 oz\/yr/);
});

test("per-pound and per-ounce names never share a cohort", () => {
  const pounds: MinerFundamentals = { ...base, symbol: "LB", primaryMetal: "Silver", quantityUnit: "lb", aiscUsdPerOz: 20 };
  const ouncePeers = [
    { ...base, symbol: "OZ1", aiscUsdPerOz: 18 },
    { ...base, symbol: "OZ2", aiscUsdPerOz: 22 },
    { ...base, symbol: "OZ3", aiscUsdPerOz: 26 },
  ];
  const cost = fundamentalScoreRead(pounds, [pounds, ...ouncePeers]).parts.find((part) => part.key === "cost");

  assert.equal(cost?.score, null, "three ounce peers are no cohort for a pound-quoted name");
});

test("costs are only ranked against figures on the same basis", () => {
  // The same mine reports a several-fold lower number net of by-product credits than per
  // equivalent ounce. Three peers on the wrong basis are no cohort at all.
  const subject: MinerFundamentals = { ...base, symbol: "SUBJ", costBasis: "aisc_byproduct", aiscUsdPerOz: 6.07 };
  const wrongBasis: MinerFundamentals[] = [
    { ...base, symbol: "X1", costBasis: "aisc_ageq", aiscUsdPerOz: 36.89 },
    { ...base, symbol: "X2", costBasis: "cash_cost", aiscUsdPerOz: 17.69 },
    { ...base, symbol: "X3", costBasis: "cas", aiscUsdPerOz: 22.99 },
  ];
  const mixed = fundamentalScoreRead(subject, [subject, ...wrongBasis]).parts.find((part) => part.key === "cost");
  assert.equal(mixed?.score, null, "a cost curve cannot be built from four different measures");

  const sameBasis: MinerFundamentals[] = wrongBasis.map((peer, index) => ({ ...peer, costBasis: "aisc_byproduct" as const, aiscUsdPerOz: [5, 7, 9][index] }));
  const matched = fundamentalScoreRead(subject, [subject, ...sameBasis]).parts.find((part) => part.key === "cost");
  assert.ok(matched?.score != null, "peers on the same basis do form a cohort");
  assert.match(matched!.note, /4 silver peers/);
  assert.match(matched!.note, /by-product/);
});

test("a component with too few same-metal peers is not scored at all", () => {
  const lonely: MinerFundamentals = { ...base, symbol: "SOLO", primaryMetal: "Platinum" };
  const read = fundamentalScoreRead(lonely, [lonely]);
  const cost = read.parts.find((part) => part.key === "cost");

  assert.equal(cost?.score, null, "a guess is worse than an absence");
  assert.match(cost!.note, /at least 3 platinum peers/);
});

test("fundamental score stays pending when too much evidence is missing", () => {
  const thin = {
    ...base,
    productionOz: null,
    aiscUsdPerOz: null,
    resourceMoz: null,
    reserveMoz: null,
    cashAud: null,
    debtAud: null,
    marketCapAud: null,
    projectStage: "Producer",
  };
  const read = fundamentalScoreRead(thin);

  assert.equal(read.model, "producer");
  assert.equal(read.score, null);
  assert.equal(read.status, "F pending");
  assert.equal(read.coverage, 45);
});

test("fundamental and valuation scores stay separate", () => {
  // base carries A$300m of capex against A$50m of cash, so a A$250m raise dilutes the NPV
  // from 1.61x enterprise value to 1.25x before it is scored.
  assert.equal(valuationScore(base), 60);
});

test("valuation risks an NPV by what it costs to fund the build", () => {
  const unfundable: MinerFundamentals = { ...base, marketCapAud: 184_000_000, cashAud: null, debtAud: null, capexAud: 753_000_000, npvAud: 1_059_000_000 };
  const funded: MinerFundamentals = { ...unfundable, capexAud: null };

  const risked = valuationRead(unfundable);
  const headline = valuationRead(funded);

  // The headline NPV is 5.8x enterprise value, which the unrisked scale called a maximum
  // discount; the capex is four times the size of the company, so holders keep about a fifth.
  assert.equal(headline.score, 100);
  assert.ok(risked.score != null && risked.score < 70, `unfundable capex must not read as a discount, got ${risked.score}`);
  assert.ok(risked.fundingDilution != null && risked.fundingDilution < 0.25);
  assert.match(risked.detail, /once .* of capex is funded/);
});

test("a build the company can pay for out of cash is not diluted", () => {
  const selfFunded: MinerFundamentals = { ...base, cashAud: 400_000_000, capexAud: 300_000_000 };
  const read = valuationRead(selfFunded);

  assert.equal(read.fundingDilution, 1);
  assert.doesNotMatch(read.detail, /capex is funded/);
});

test("valuation is symmetric in log space around parity", () => {
  const at = (npvAud: number) => valuationScore({ ...base, cashAud: null, debtAud: null, capexAud: null, marketCapAud: 100_000_000, npvAud });

  assert.equal(at(100_000_000), 50, "NPV equal to enterprise value is neutral");
  assert.equal(at(300_000_000), 100, "three times enterprise value is full marks");
  assert.equal(at(33_333_333), 0, "one third of enterprise value is the floor");
  // The old linear form could not score below 25 for any positive NPV.
  assert.equal(at(50_000_000), 18, "priced at twice its NPV is stretched, not fair");
  assert.ok((at(150_000_000) ?? 0) > (at(120_000_000) ?? 0), "cheaper must always score higher");
});

test("valuation says which evidence is missing instead of going quietly blank", () => {
  const noMarketCap = valuationRead({ ...base, marketCapAud: null });
  assert.equal(noMarketCap.score, null);
  assert.match(noMarketCap.detail, /market capitalisation/);

  const noNpv = valuationRead({ ...base, npvAud: null });
  assert.equal(noNpv.score, null);
  assert.match(noNpv.detail, /NPV/);

  const fund = valuationRead({ ...base, projectStage: "ETF", productionOz: null });
  assert.equal(fund.score, null);
  assert.match(fund.detail, /Classify the stage/);
});

test("developer fundamentals no longer double-count NPV against enterprise value", () => {
  const developer: MinerFundamentals = { ...base, projectStage: "Developer", productionOz: null, aiscUsdPerOz: null };
  const read = fundamentalScoreRead(developer);

  assert.equal(read.model, "developer");
  assert.ok(!read.parts.some((part) => part.key === "valuation"), "valuation belongs to V, not F");
  assert.equal(read.parts.reduce((sum, part) => sum + part.max, 0), 100);
});

test("allocationRead gates a quality leader when entry is absent", () => {
  const read = allocationRead({ fundamentals: base, cohort, relativeScore: 88, relativeVelocity: -4 });

  assert.equal(read.label, "QUALITY LEADER / WAIT");
  assert.equal(read.gauges.map((gauge) => gauge.label).join(""), "FRVE");
  assert.equal(read.gauges.find((gauge) => gauge.key === "entry")?.status, "E pending");
  assert.ok(read.note.includes("Entry Score"));
});

test("allocationRead distinguishes speculative momentum from high conviction", () => {
  const weakFundamentals = { ...base, jurisdictionScore: 1, balanceSheetScore: 2, dilutionScore: 1, managementScore: 2 };
  const read = allocationRead({ fundamentals: weakFundamentals, cohort, relativeScore: 95, relativeVelocity: 11, entryScore: 70 });

  assert.equal(read.label, "SPECULATIVE MOMENTUM");
  assert.equal(read.gauges.find((gauge) => gauge.key === "fundamental")?.tone, "bad");
  assert.equal(read.gauges.find((gauge) => gauge.key === "relative")?.tone, "good");
});

test("valuation falls back to price per unit against the peer cohort when no NPV exists", () => {
  const priced = goldCohort.map((peer, index) => ({ ...peer, marketCapAud: [20_000_000_000, 15_000_000_000, 4_000_000_000, 5_000_000_000][index] }));
  const read = valuationRead(priced[0], priced);

  assert.equal(read.basis, "ev_per_production");
  assert.ok(read.score != null);
  assert.match(read.detail, /per oz against a gold peer median/);
});

test("allocationRead does not call an aligned setup mixed when entry is merely constructive", () => {
  const read = allocationRead({ fundamentals: base, cohort, relativeScore: 80, relativeVelocity: 2, entryScore: 58 });

  assert.equal(read.label, "QUALITY LEADER / ENTRY CONSTRUCTIVE");
  assert.equal(read.provisional, false);
  assert.equal(read.scoredSignals, 4);
});

test("the gauges carry coverage and the model that produced the score", () => {
  const read = allocationRead({ fundamentals: base, cohort, relativeScore: 80, relativeVelocity: 2, entryScore: 58, relativeCoverage: 0.7, entryCoverage: 0.8 });
  const gauge = (key: string) => read.gauges.find((item) => item.key === key);

  assert.equal(gauge("relative")?.coverage, 0.7);
  assert.equal(gauge("entry")?.coverage, 0.8);
  assert.equal(gauge("fundamental")?.coverage, 1);
  assert.equal(gauge("valuation")?.basisLabel, "NPV/EV", "the reader must know which valuation model ran");
});

test("entry reads as pending rather than not wired", () => {
  const read = allocationRead({ fundamentals: base, cohort, relativeScore: 80, relativeVelocity: 2 });

  assert.equal(read.gauges.find((item) => item.key === "entry")?.status, "E pending");
});

test("allocationRead warns when it rests on fewer than three signals", () => {
  const thin = allocationRead({ fundamentals: undefined, relativeScore: 80, relativeVelocity: 1 });
  const full = allocationRead({ fundamentals: base, cohort, relativeScore: 80, relativeVelocity: 2, entryScore: 58 });

  assert.equal(thin.scoredSignals, 1);
  assert.match(thin.warning ?? "", /1 of 4 signals/);
  assert.equal(full.warning, null, "four scored signals need no warning");
});

test("allocationRead names the pending case instead of guessing", () => {
  const read = allocationRead({ fundamentals: undefined, relativeScore: null, relativeVelocity: null });

  assert.equal(read.label, "INSUFFICIENT DATA");
  assert.equal(read.allocationScore, null);
  assert.equal(read.provisional, true);
  assert.ok(read.note.includes("0 of 4 signals scored"));
});

test("allocationRead keeps quality watchlist separate from current leadership", () => {
  const read = allocationRead({ fundamentals: { ...base, jurisdictionScore: 5, balanceSheetScore: 5, dilutionScore: 5, managementScore: 5 }, cohort, relativeScore: 35, relativeVelocity: 3 });

  assert.equal(read.label, "QUALITY / NOT CURRENTLY EARNING CAPITAL");
  assert.ok(read.note.includes("market has not yet confirmed"));
});
