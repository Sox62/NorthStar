import type { MinerFundamentals } from "@/lib/storage";
import type { Holding } from "@/southernstar/types";
import { dateOrDash, money, moneyOrDash, numberOrDash } from "./model";
import { COST_SPREAD, MIN_COHORT, SCALE_SPREAD, VALUATION_SPREAD, annualisedProduction, cohortAnchoredScore, cohortMedianFor, quantityUnitOf, reportingPeriodOf, type CohortRead } from "./cohort";

export type RiskTone = "good" | "warning" | "bad";
export type SouthernStarTone = "good" | "warning" | "bad" | "muted";

export type SouthernStarGauge = {
  key: "fundamental" | "relative" | "valuation" | "entry";
  label: string;
  score: number | null;
  tone: SouthernStarTone;
  status: string;
  note: string;
};

export type SouthernStarAllocationRead = {
  allocationScore: number | null;
  label: string;
  note: string;
  /** How many of F/R/V/E actually produced a score. */
  scoredSignals: number;
  /** True when the allocation score was renormalised over fewer than four signals. */
  provisional: boolean;
  gauges: SouthernStarGauge[];
};

type SignalBand = "strong" | "mixed" | "weak" | "unknown";
type EntryBand = "good" | "constructive" | "poor" | "unknown";

function signalBand(score: number | null): SignalBand {
  if (score == null) return "unknown";
  if (score >= 70) return "strong";
  if (score < 50) return "weak";
  return "mixed";
}

function entryBand(score: number | null): EntryBand {
  if (score == null) return "unknown";
  if (score >= 65) return "good";
  if (score < 50) return "poor";
  return "constructive";
}

/**
 * Every F band against every R band, modulated by entry. The previous if/else ladder left gaps:
 * a strong F with a strong R and an entry between 50 and 64 matched no branch and fell through
 * to "signals are mixed", which is the opposite of what those three readings say.
 */
function allocationLabelFor(input: { fundamental: number | null; relative: number | null; entry: number | null; velocity: number | null }): { label: string; note: string } {
  const fundamental = signalBand(input.fundamental);
  const relative = signalBand(input.relative);
  const entry = entryBand(input.entry);
  const improving = input.velocity != null && input.velocity > 0;

  if (fundamental === "strong" && relative === "strong") {
    if (entry === "good") return { label: "OWN / ADD CANDIDATE", note: "Quality, market leadership and entry condition are aligned." };
    if (entry === "constructive") return { label: "QUALITY LEADER / ENTRY CONSTRUCTIVE", note: "Fundamentals and relative strength agree and the setup is workable, though not at its most attractive." };
    if (entry === "poor") return { label: "QUALITY LEADER / WAIT", note: "Fundamentals and relative strength agree, but the current price setup is a poor place to add." };
    return { label: "QUALITY LEADER / WAIT", note: "Fundamentals and relative strength agree, but Entry Score has not confirmed an add point." };
  }
  if (fundamental === "strong") {
    if (relative === "mixed") {
      return improving
        ? { label: "QUALITY / LEADERSHIP IMPROVING", note: "Fundamentals are strong and relative strength is turning up, but leadership is not yet established." }
        : { label: "QUALITY / LEADERSHIP UNCONFIRMED", note: "Fundamentals are strong but relative strength is only middling; wait for the market to confirm." };
    }
    if (relative === "weak") return { label: "QUALITY / NOT CURRENTLY EARNING CAPITAL", note: "Fundamentals are strong but the market has not yet confirmed relative leadership." };
    return { label: "QUALITY / RELATIVE PENDING", note: "Fundamentals are strong; there is not enough stored ratio history to judge relative leadership yet." };
  }
  if (fundamental === "mixed") {
    if (relative === "strong") return { label: "MOMENTUM / FUNDAMENTALS MIXED", note: "The market is rewarding this, but the fundamental case is only partly made." };
    if (relative === "mixed") return { label: "WATCH", note: "Neither the business nor the market is making a clear case; inspect before allocating." };
    if (relative === "weak") return { label: "WATCH / NOT EARNING CAPITAL", note: "Mixed fundamentals and no relative leadership; nothing here demands capital." };
    return { label: "WATCH / RELATIVE PENDING", note: "Fundamentals are mixed and there is not enough ratio history to judge leadership." };
  }
  if (fundamental === "weak") {
    if (relative === "strong") return { label: "SPECULATIVE MOMENTUM", note: "Relative strength is strong, but fundamentals do not clear the risk gate." };
    if (relative === "mixed") return { label: "SPECULATIVE / LEADERSHIP UNCONFIRMED", note: "Fundamentals do not clear the risk gate and the market has not confirmed the trade either." };
    if (relative === "weak") return { label: "AVOID / RESEARCH ONLY", note: "Neither fundamentals nor relative strength currently justify capital." };
    return { label: "WEAK FUNDAMENTALS / RELATIVE PENDING", note: "Fundamentals do not clear the risk gate; relative leadership cannot be judged yet." };
  }
  if (relative === "strong") return { label: "RELATIVE LEADER / FUNDAMENTALS PENDING", note: "The market is rewarding this, but F has too little recorded evidence to score. Research is the next step." };
  if (relative === "mixed") return { label: "FUNDAMENTALS PENDING", note: "Relative strength is unremarkable and F has too little recorded evidence to score." };
  if (relative === "weak") return { label: "NOT EARNING CAPITAL / FUNDAMENTALS PENDING", note: "Relative strength is weak and F has too little recorded evidence to score." };
  return { label: "INSUFFICIENT DATA", note: "Neither fundamentals nor relative strength can be scored from what is recorded." };
}

export type FundamentalScorePart = {
  key: string;
  label: string;
  score: number | null;
  max: number;
  note: string;
};

export type FundamentalScoreRead = {
  score: number | null;
  model: "producer" | "developer" | "explorer" | "unknown";
  status: string;
  coverage: number;
  parts: FundamentalScorePart[];
};

export type RiskRow = {
  key: string;
  label: string;
  note: string;
  level: string;
  tone: RiskTone;
  /** 0-1 across the 0-5 research scale, so the score can be drawn rather than only named. */
  score: number | null;
};

export type DetailField = { key: string; label: string; value: string };
export type ValuationRow = { key: string; label: string; value: string; tone?: "positive" | "negative"; emphasis?: boolean };

/** Scores are captured 0-5 on the research form, higher being better. */
export function riskLevel(score: number | null | undefined): { level: string; tone: RiskTone; score: number | null } {
  const normalised = score == null ? null : Math.min(1, Math.max(0, score / 5));
  return { ...riskBand(score), score: normalised };
}

function riskBand(score: number | null | undefined): { level: string; tone: RiskTone } {
  if (score == null) return { level: "Not scored", tone: "warning" };
  if (score >= 4.5) return { level: "Low", tone: "good" };
  if (score >= 3.5) return { level: "Low to moderate", tone: "good" };
  if (score >= 2.5) return { level: "Moderate", tone: "warning" };
  if (score >= 1.5) return { level: "Elevated", tone: "warning" };
  return { level: "High", tone: "bad" };
}

export function netCashAud(fundamentals: MinerFundamentals | undefined) {
  if (!fundamentals) return null;
  if (fundamentals.cashAud == null && fundamentals.debtAud == null) return null;
  return (fundamentals.cashAud ?? 0) - (fundamentals.debtAud ?? 0);
}


export function riskJudgementScore(fundamentals: MinerFundamentals | undefined) {
  const scores = [fundamentals?.jurisdictionScore, fundamentals?.balanceSheetScore, fundamentals?.dilutionScore, fundamentals?.managementScore]
    .filter((value): value is number => value != null);
  if (!scores.length) return null;
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function scoreOutOf(value: number | null, max: number, note: string, label: string, key: string): FundamentalScorePart {
  return { key, label, score: value == null ? null : Math.min(max, Math.max(0, value)), max, note };
}

/** Says which peer group a component was judged against, or exactly what is missing. */
function cohortNote(label: string, value: number | null, unitSuffix: string, cohort: CohortRead, scored: number | null) {
  if (scored != null) {
    return `${numberOrDash(value, unitSuffix)} against a ${cohort.metal} peer median of ${numberOrDash(cohort.median, unitSuffix)} across ${cohort.size} names.`;
  }
  if (value == null) return `Needs ${label}.`;
  return `Needs at least ${MIN_COHORT} ${cohort.metal} peers with ${label} recorded; ${cohort.size} available.`;
}

function judgementPoints(score: number | null | undefined, max: number) {
  return score == null ? null : score / 5 * max;
}

function reserveConversionScore(fundamentals: MinerFundamentals, max: number) {
  if (!fundamentals.resourceMoz || fundamentals.reserveMoz == null) return null;
  return Math.min(max, fundamentals.reserveMoz / fundamentals.resourceMoz / 0.35 * max);
}

function balanceEvidenceScore(fundamentals: MinerFundamentals, max: number) {
  const net = netCashAud(fundamentals);
  const enterprise = enterpriseValueAud(fundamentals);
  if (net == null && fundamentals.balanceSheetScore == null) return null;
  const manual = judgementPoints(fundamentals.balanceSheetScore, max);
  if (net == null) return manual == null ? null : manual * 0.55;
  if (enterprise && enterprise > 0) {
    const netCashRatio = net / enterprise;
    const derived = netCashRatio >= 0.1 ? max : netCashRatio >= 0 ? max * 0.78 : netCashRatio >= -0.2 ? max * 0.45 : max * 0.2;
    return manual == null ? derived : derived * 0.65 + manual * 0.35;
  }
  const derived = net >= 0 ? max * 0.8 : max * 0.35;
  return manual == null ? derived : derived * 0.65 + manual * 0.35;
}

function producerScore(fundamentals: MinerFundamentals, cohort: MinerFundamentals[]): FundamentalScorePart[] {
  const unit = quantityUnitOf(fundamentals);
  const costCohort = cohortMedianFor(fundamentals, cohort, (peer) => peer.aiscUsdPerOz);
  const cost = cohortAnchoredScore({ value: fundamentals.aiscUsdPerOz, cohort: costCohort, lowerIsBetter: true, spread: COST_SPREAD, max: 25 });
  // Annualised on both sides, or a name reporting a quarter is ranked against one reporting a year.
  const annual = annualisedProduction(fundamentals);
  const scaleCohort = cohortMedianFor(fundamentals, cohort, annualisedProduction);
  const scale = cohortAnchoredScore({ value: annual, cohort: scaleCohort, lowerIsBetter: false, spread: SCALE_SPREAD, max: 15 });
  return [
    scoreOutOf(cost, 25, cohortNote("AISC", fundamentals.aiscUsdPerOz, ` USD/${unit}`, costCohort, cost), "Cost position", "cost"),
    scoreOutOf(balanceEvidenceScore(fundamentals, 20), 20, fundamentals.cashAud == null && fundamentals.debtAud == null ? "Manual balance judgement discounted until cash/debt are recorded." : "Cash, debt and enterprise value where available.", "Balance sheet", "balance"),
    scoreOutOf(scale, 15, cohortNote("annual production", annual, ` ${unit}/yr`, scaleCohort, scale), "Production scale", "production"),
    scoreOutOf(reserveConversionScore(fundamentals, 15), 15, fundamentals.resourceMoz && fundamentals.reserveMoz != null ? "Reserve conversion from recorded resource base." : "Needs resource and reserve.", "Reserve quality", "reserve"),
    scoreOutOf(judgementPoints(fundamentals.jurisdictionScore, 10), 10, fundamentals.jurisdiction || "Needs jurisdiction.", "Jurisdiction", "jurisdiction"),
    scoreOutOf(judgementPoints(fundamentals.managementScore, 10), 10, "Manual execution judgement.", "Management", "management"),
    scoreOutOf(judgementPoints(fundamentals.dilutionScore, 5), 5, "Manual dilution judgement.", "Dilution", "dilution"),
  ];
}

/**
 * Valuation deliberately does not appear here. NPV against enterprise value is V's job, and
 * scoring it in both places let a single input drive roughly a third of the Allocation read
 * while the panel claimed the two were independent. F answers "is this worth owning at all",
 * V answers "at this price".
 */
function developerScore(fundamentals: MinerFundamentals): FundamentalScorePart[] {
  const enterprise = enterpriseValueAud(fundamentals);
  const capex = fundamentals.capexAud;
  return [
    scoreOutOf(fundamentals.irrPercent == null ? null : fundamentals.irrPercent >= 30 ? 20 : fundamentals.irrPercent >= 20 ? 15 : fundamentals.irrPercent >= 12 ? 9 : 4, 20, fundamentals.irrPercent == null ? "Needs IRR." : `IRR ${numberOrDash(fundamentals.irrPercent, "%")}.`, "Project return", "irr"),
    scoreOutOf(capex == null || !enterprise ? null : enterprise >= capex ? 20 : enterprise >= capex * 0.5 ? 12 : 5, 20, capex == null || !enterprise ? "Needs capex and market value." : "Funding task compared with current enterprise value.", "Funding scale", "funding"),
    scoreOutOf(reserveConversionScore(fundamentals, 20), 20, fundamentals.resourceMoz && fundamentals.reserveMoz != null ? "Reserve conversion from recorded resource base." : "Needs resource and reserve.", "Resource quality", "resource"),
    scoreOutOf(balanceEvidenceScore(fundamentals, 15), 15, fundamentals.cashAud == null && fundamentals.debtAud == null ? "Needs cash/debt to verify." : "Cash and debt position.", "Balance sheet", "balance"),
    scoreOutOf(judgementPoints(fundamentals.jurisdictionScore, 15), 15, fundamentals.jurisdiction || "Needs jurisdiction.", "Jurisdiction", "jurisdiction"),
    scoreOutOf(judgementPoints(fundamentals.managementScore, 10), 10, "Manual execution judgement.", "Management", "management"),
  ];
}

function explorerScore(fundamentals: MinerFundamentals, cohort: MinerFundamentals[]): FundamentalScorePart[] {
  const unit = quantityUnitOf(fundamentals);
  const enterprise = enterpriseValueAud(fundamentals);
  const cashRunway = fundamentals.cashAud != null && enterprise ? fundamentals.cashAud / enterprise : null;
  const resourceCohort = cohortMedianFor(fundamentals, cohort, (peer) => peer.resourceMoz);
  const resource = cohortAnchoredScore({ value: fundamentals.resourceMoz, cohort: resourceCohort, lowerIsBetter: false, spread: SCALE_SPREAD, max: 25 });
  return [
    scoreOutOf(resource, 25, cohortNote("a resource estimate", fundamentals.resourceMoz, ` M${unit}`, resourceCohort, resource), "Resource potential", "resource"),
    scoreOutOf(cashRunway == null ? null : cashRunway >= 0.25 ? 20 : cashRunway >= 0.1 ? 14 : cashRunway >= 0.04 ? 8 : 3, 20, cashRunway == null ? "Needs cash and market value." : "Cash as a share of enterprise value.", "Cash runway", "cash"),
    scoreOutOf(judgementPoints(fundamentals.dilutionScore, 15), 15, "Manual dilution judgement.", "Dilution", "dilution"),
    scoreOutOf(judgementPoints(fundamentals.jurisdictionScore, 15), 15, fundamentals.jurisdiction || "Needs jurisdiction.", "Jurisdiction", "jurisdiction"),
    scoreOutOf(judgementPoints(fundamentals.managementScore, 15), 15, "Manual execution judgement.", "Management", "management"),
    scoreOutOf(balanceEvidenceScore(fundamentals, 10), 10, fundamentals.cashAud == null && fundamentals.debtAud == null ? "Needs cash/debt to verify." : "Cash and debt position.", "Balance sheet", "balance"),
  ];
}

function scoreModel(fundamentals: MinerFundamentals | undefined): FundamentalScoreRead["model"] {
  const stage = (fundamentals?.projectStage ?? "").toLowerCase();
  if (!fundamentals) return "unknown";
  if (fundamentals.productionOz || /produc|operat/.test(stage)) return "producer";
  if (/develop|permitting|study|feasibility|pre[- ]?production/.test(stage)) return "developer";
  if (/explor|drill|discovery/.test(stage)) return "explorer";
  return "unknown";
}

export function fundamentalScoreRead(fundamentals: MinerFundamentals | undefined, cohort: MinerFundamentals[] = []): FundamentalScoreRead {
  const model = scoreModel(fundamentals);
  const parts = !fundamentals ? [] : model === "producer" ? producerScore(fundamentals, cohort) : model === "developer" ? developerScore(fundamentals) : model === "explorer" ? explorerScore(fundamentals, cohort) : [];
  const scored = parts.filter((part) => part.score != null);
  const maxScored = scored.reduce((sum, part) => sum + part.max, 0);
  const maxPossible = parts.reduce((sum, part) => sum + part.max, 0);
  const evidenceKeys = new Set(["cost", "production", "reserve", "valuation", "irr", "funding", "resource", "cash"]);
  const factualCoverage = scored.filter((part) => evidenceKeys.has(part.key)).reduce((sum, part) => sum + part.max, 0);
  const rawScore = maxScored < 45 || factualCoverage < 20 ? null : Math.round(scored.reduce((sum, part) => sum + (part.score ?? 0), 0) / maxScored * 100);
  const judgement = riskJudgementScore(fundamentals);
  const cappedScore = rawScore == null ? null : judgement != null && judgement < 2 ? Math.min(rawScore, 44) : judgement != null && judgement < 2.5 ? Math.min(rawScore, 55) : rawScore;
  const coverage = maxPossible ? Math.round(maxScored / maxPossible * 100) : 0;
  const status = cappedScore == null ? "F pending" : cappedScore >= 75 ? "Quality candidate" : cappedScore >= 50 ? "Mixed fundamentals" : "Weak fundamentals";
  return { score: cappedScore, model, status, coverage, parts };
}

export function fundamentalQualityScore(fundamentals: MinerFundamentals | undefined, cohort: MinerFundamentals[] = []) {
  return fundamentalScoreRead(fundamentals, cohort).score;
}

export type ValuationRead = {
  score: number | null;
  basis: "npv_ev" | "ev_per_production" | "ev_per_resource" | null;
  label: string;
  status: string;
  detail: string;
  /** Share of a project NPV still owned by today's holders after the build is funded, 0-1. */
  fundingDilution: number | null;
};

/**
 * An NPV only reaches today's shareholders through whatever equity survives building the mine.
 * Where capex exceeds cash on hand the shortfall has to be raised, and at roughly current market
 * value that raise costs existing holders `raise / (enterprise + raise)` of the project.
 *
 * This is the difference between a headline NPV of 5.7x enterprise value and the ~1.1x its
 * holders would actually own after funding a capex four times the size of the company. Without
 * it, V scores an unfundable paper NPV as a maximum discount while F's own funding-scale
 * component correctly scores it near zero — the two halves of the read contradicting each other.
 *
 * Deliberately only the funding haircut. Study confidence (PEA vs PFS vs DFS) and the vintage of
 * the commodity price the study assumed are not risked here, because neither is a recorded field.
 */
function fundingDilution(fundamentals: MinerFundamentals, enterprise: number) {
  const capex = fundamentals.capexAud;
  if (capex == null || capex <= 0) return 1;
  const raise = Math.max(0, capex - (fundamentals.cashAud ?? 0));
  if (raise <= 0) return 1;
  return enterprise / (enterprise + raise);
}

/**
 * Parity scores 50 and the scale is symmetric in log space: three times enterprise value scores
 * 100, one third of it scores 0. The previous linear form could not fall below 25 for any
 * positive NPV and saturated at 3x, so it read an asset priced at twice its NPV and one priced
 * at ten times it as nearly the same.
 */
export const VALUATION_FULL_MARKS_MULTIPLE = 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function valuationStatus(score: number) {
  return score >= 75 ? "Discount" : score >= 45 ? "Fair/mixed" : "Stretched";
}

/**
 * For names carrying no project NPV, price is judged per unit of what they actually own against
 * the same-metal peer median: enterprise value per annual ounce for a producer, per resource
 * ounce for a developer or explorer. Anchoring on the cohort avoids inventing a fair multiple
 * for each metal, and it answers the question a portfolio actually asks — cheap or dear
 * *relative to the alternatives already on the screen*.
 */
function perUnitValuation(input: {
  fundamentals: MinerFundamentals;
  enterprise: number;
  cohort: MinerFundamentals[];
  model: FundamentalScoreRead["model"];
}): ValuationRead | null {
  const { fundamentals, enterprise, cohort, model } = input;
  const unit = quantityUnitOf(fundamentals);
  const basis = model === "producer"
    ? { key: "ev_per_production" as const, label: `Enterprise value per annual ${unit}`, pick: annualisedProduction, quantity: annualisedProduction(fundamentals) }
    : { key: "ev_per_resource" as const, label: `Enterprise value per resource ${unit}`, pick: (peer: MinerFundamentals) => peer.resourceMoz, quantity: fundamentals.resourceMoz };
  if (basis.quantity == null || basis.quantity <= 0) return null;
  const perUnit = enterprise / basis.quantity;
  const peers = cohortMedianFor(fundamentals, cohort, (peer) => {
    const peerEnterprise = enterpriseValueAud(peer);
    const peerQuantity = basis.pick(peer);
    return peerEnterprise != null && peerEnterprise > 0 && peerQuantity != null && peerQuantity > 0 ? peerEnterprise / peerQuantity : null;
  });
  const raw = cohortAnchoredScore({ value: perUnit, cohort: peers, lowerIsBetter: true, spread: VALUATION_SPREAD, max: 100 });
  if (raw == null) return null;
  const score = Math.round(raw);
  return {
    score,
    basis: basis.key,
    label: basis.label,
    status: valuationStatus(score),
    // A price per producing ounce already reflects the asset as built, so there is nothing to risk.
    fundingDilution: null,
    detail: `${moneyOrDash(perUnit)} per ${unit} against a ${peers.metal} peer median of ${moneyOrDash(peers.median)} across ${peers.size} names.`,
  };
}

export function valuationRead(fundamentals: MinerFundamentals | undefined, cohort: MinerFundamentals[] = []): ValuationRead {
  const model = scoreModel(fundamentals);
  if (!fundamentals || model === "unknown") {
    return {
      score: null,
      basis: null,
      label: "No valuation model",
      status: "Not valued",
      fundingDilution: null,
      detail: "Classify the stage as producer, developer or explorer first. A fund's market price is its own valuation.",
    };
  }
  const enterprise = enterpriseValueAud(fundamentals);
  if (enterprise == null || enterprise <= 0) {
    return {
      score: null,
      basis: null,
      label: "NPV vs enterprise value",
      status: "Not valued",
      fundingDilution: null,
      detail: fundamentals.marketCapAud == null
        ? "Needs market capitalisation before enterprise value can be derived."
        : "Enterprise value is not positive, so a ratio to it would not mean anything.",
    };
  }
  if (fundamentals.npvAud == null) {
    const perUnit = perUnitValuation({ fundamentals, enterprise, cohort, model });
    if (perUnit) return perUnit;
    const unit = quantityUnitOf(fundamentals);
    return {
      score: null,
      basis: null,
      label: model === "producer" ? `Enterprise value per annual ${unit}` : `Enterprise value per resource ${unit}`,
      status: "Not valued",
      fundingDilution: null,
      detail: `Needs a sourced NPV, or at least ${MIN_COHORT} same-metal peers carrying both a market capitalisation and a ${model === "producer" ? "production" : "resource"} figure.`,
    };
  }
  const dilution = fundingDilution(fundamentals, enterprise);
  const headline = fundamentals.npvAud / enterprise;
  const ratio = headline * dilution;
  const score = Math.round(clamp(50 + 50 * Math.log(ratio) / Math.log(VALUATION_FULL_MARKS_MULTIPLE), 0, 100));
  const raise = Math.max(0, (fundamentals.capexAud ?? 0) - (fundamentals.cashAud ?? 0));
  return {
    score,
    basis: "npv_ev",
    label: "NPV vs enterprise value",
    status: valuationStatus(score),
    fundingDilution: dilution,
    detail: dilution < 1
      ? `NPV is ${headline.toFixed(2)}x enterprise value, ${ratio.toFixed(2)}x once ${moneyOrDash(raise)} of capex is funded.`
      : `NPV is ${headline.toFixed(2)}x enterprise value.`,
  };
}

export function valuationScore(fundamentals: MinerFundamentals | undefined, cohort: MinerFundamentals[] = []) {
  return valuationRead(fundamentals, cohort).score;
}

export function stageMethodology(fundamentals: MinerFundamentals | undefined) {
  const stage = (fundamentals?.projectStage ?? "").toLowerCase();
  if (fundamentals?.productionOz || /produc|operat/.test(stage)) return "Producer model: margins, balance sheet, production quality, jurisdiction, management and growth.";
  if (/develop|permitting|study|feasibility|pre[- ]?production/.test(stage)) return "Developer model: resource quality, IRR, capex funding, permitting, jurisdiction and management; price is scored separately as V.";
  if (/explor|drill|discovery/.test(stage)) return "Explorer model: geology, resource potential, cash runway, enterprise value, drill results, dilution, jurisdiction and management.";
  return "Stage not set: use the saved fundamentals screen to classify this as producer, developer or explorer.";
}

export function scoreTone(score: number | null): SouthernStarTone {
  if (score == null) return "muted";
  if (score >= 75) return "good";
  if (score >= 45) return "warning";
  return "bad";
}

export function allocationRead(input: {
  fundamentals: MinerFundamentals | undefined;
  /** Every recorded fundamental, so cost, scale and price can be judged against same-metal peers. */
  cohort?: MinerFundamentals[];
  relativeScore: number | null;
  relativeVelocity: number | null;
  entryScore?: number | null;
}) {
  const cohort = input.cohort ?? [];
  const fundamental = fundamentalQualityScore(input.fundamentals, cohort);
  const valuationDetail = valuationRead(input.fundamentals, cohort);
  const valuation = valuationDetail.score;
  const entry = input.entryScore ?? null;
  const gauges: SouthernStarGauge[] = [
    {
      key: "fundamental",
      label: "F",
      score: fundamental,
      tone: scoreTone(fundamental),
      status: fundamentalScoreRead(input.fundamentals, cohort).status,
      note: `${stageMethodology(input.fundamentals)} Requires enough factual coverage before F is scored.`,
    },
    {
      key: "relative",
      label: "R",
      score: input.relativeScore == null ? null : Math.round(input.relativeScore),
      tone: scoreTone(input.relativeScore),
      status: input.relativeScore == null ? "Not scored" : input.relativeScore >= 75 ? "Leadership" : input.relativeScore >= 45 ? "Improving/neutral" : "Not earning capital",
      note: input.relativeVelocity == null ? "Reserve, sector and peer trend score." : "Reserve, sector and peer trend score; velocity " + (input.relativeVelocity >= 0 ? "+" : "") + Math.round(input.relativeVelocity) + " over 30d.",
    },
    {
      key: "valuation",
      label: "V",
      score: valuation,
      tone: scoreTone(valuation),
      status: valuationDetail.status,
      note: valuation == null
        ? valuationDetail.detail
        : `${valuationDetail.detail} A good asset can still be a poor price.`,
    },
    {
      key: "entry",
      label: "E",
      score: entry,
      tone: scoreTone(entry),
      status: entry == null ? "Not wired" : entry >= 75 ? "Attractive" : entry >= 45 ? "Mixed" : "Poor entry",
      note: entry == null ? "Entry Score will use technical condition and structure; it is not inferred from relative strength." : "Technical condition and structural entry score.",
    },
  ];
  const weightedInputs = [
    { value: fundamental, weight: 0.35 },
    { value: input.relativeScore, weight: 0.35 },
    { value: valuation, weight: 0.20 },
    { value: entry, weight: 0.10 },
  ].filter((item): item is { value: number; weight: number } => item.value != null);
  const allocationScore = weightedInputs.length
    ? Math.round(weightedInputs.reduce((sum, item) => sum + item.value * item.weight, 0) / weightedInputs.reduce((sum, item) => sum + item.weight, 0))
    : null;
  const read = allocationLabelFor({ fundamental, relative: input.relativeScore, entry, velocity: input.relativeVelocity });
  const scoredSignals = weightedInputs.length;
  const provisional = scoredSignals < 4;
  const note = provisional
    ? read.note + " Provisional: " + scoredSignals + " of 4 signals scored."
    : read.note;
  return { allocationScore, label: read.label, note, scoredSignals, provisional, gauges } satisfies SouthernStarAllocationRead;
}

/** Market capitalisation plus debt less cash — the figure a project NPV should be compared against. */
export function enterpriseValueAud(fundamentals: MinerFundamentals | undefined) {
  if (!fundamentals?.marketCapAud) return null;
  return fundamentals.marketCapAud + (fundamentals.debtAud ?? 0) - (fundamentals.cashAud ?? 0);
}

export function fundamentalFields(holding: Holding, fundamentals: MinerFundamentals | undefined): DetailField[] {
  const net = netCashAud(fundamentals);
  const enterprise = enterpriseValueAud(fundamentals);
  return [
    { key: "metal", label: "Primary metal", value: fundamentals?.primaryMetal || "-" },
    { key: "stage", label: "Project stage", value: fundamentals?.projectStage || "-" },
    { key: "jurisdiction", label: "Jurisdiction", value: fundamentals?.jurisdiction || "-" },
    { key: "exchange", label: "Exchange", value: holding.exchange || "-" },
    { key: "production", label: `Production ${quantityUnitOf(fundamentals)} (${reportingPeriodOf(fundamentals)})`, value: numberOrDash(fundamentals?.productionOz) },
    { key: "annual", label: `Annualised ${quantityUnitOf(fundamentals)}`, value: numberOrDash(annualisedProduction(fundamentals)) },
    { key: "aisc", label: `AISC US$/${quantityUnitOf(fundamentals)}`, value: numberOrDash(fundamentals?.aiscUsdPerOz) },
    { key: "resource", label: `Resource M${quantityUnitOf(fundamentals)}`, value: numberOrDash(fundamentals?.resourceMoz) },
    { key: "reserve", label: `Reserve M${quantityUnitOf(fundamentals)}`, value: numberOrDash(fundamentals?.reserveMoz) },
    { key: "cash", label: "Cash", value: moneyOrDash(fundamentals?.cashAud) },
    { key: "debt", label: "Debt", value: moneyOrDash(fundamentals?.debtAud) },
    { key: "net", label: "Net cash", value: moneyOrDash(net) },
    { key: "mktcap", label: "Market cap", value: moneyOrDash(fundamentals?.marketCapAud) },
    { key: "ev", label: "Enterprise value", value: moneyOrDash(enterprise) },
    { key: "npv", label: "Project NPV", value: moneyOrDash(fundamentals?.npvAud) },
    { key: "capex", label: "Capex", value: moneyOrDash(fundamentals?.capexAud) },
    { key: "irr", label: "IRR", value: numberOrDash(fundamentals?.irrPercent, "%") },
    { key: "position", label: "Position value", value: money(holding.marketValueAud) },
    { key: "asof", label: "Fundamentals as at", value: dateOrDash(fundamentals?.asOfDate) },
  ];
}

export function riskRows(fundamentals: MinerFundamentals | undefined): RiskRow[] {
  const enterprise = enterpriseValueAud(fundamentals);
  const capexCover = fundamentals?.capexAud && enterprise ? enterprise / fundamentals.capexAud : null;
  const net = netCashAud(fundamentals);
  return [
    {
      key: "jurisdiction",
      label: "Jurisdiction",
      note: fundamentals?.jurisdiction || "No jurisdiction recorded",
      ...riskLevel(fundamentals?.jurisdictionScore),
    },
    {
      key: "balance",
      label: "Balance sheet",
      note: net == null ? "No cash or debt recorded" : `${net >= 0 ? "Net cash" : "Net debt"} ${money(Math.abs(net))}`,
      ...riskLevel(fundamentals?.balanceSheetScore),
    },
    {
      key: "dilution",
      label: "Dilution",
      note: "Ounces per share against issuance history",
      ...riskLevel(fundamentals?.dilutionScore),
    },
    {
      key: "management",
      label: "Management",
      note: "Execution record against stated plans",
      ...riskLevel(fundamentals?.managementScore),
    },
    {
      key: "stage",
      label: "Project stage",
      note: fundamentals?.projectStage || "No stage recorded",
      level: fundamentals?.productionOz ? "Producing" : fundamentals?.projectStage ? "Pre-production" : "Not scored",
      tone: fundamentals?.productionOz ? "good" : "warning",
      score: fundamentals?.productionOz ? 1 : fundamentals?.projectStage ? 0.5 : null,
    },
    {
      key: "funding",
      label: "Capex cover",
      note: capexCover == null
        ? "Needs capex and market cap to assess"
        : `Enterprise value is ${capexCover.toFixed(2)}x capex`,
      level: capexCover == null ? "Not scored" : capexCover >= 1 ? "Self-fundable" : "Funding gap",
      tone: capexCover == null ? "warning" : capexCover >= 1 ? "good" : "bad",
      score: capexCover == null ? null : Math.min(1, capexCover),
    },
  ];
}

/**
 * The design frames this as "do shareholders receive it?" — an NPV is only worth what survives
 * execution probability and a valuation haircut, measured against what the market already pays.
 */
export function valuationRows(input: {
  fundamentals: MinerFundamentals | undefined;
  probability: number;
  haircutPercent: number;
}): ValuationRow[] {
  const npv = input.fundamentals?.npvAud ?? null;
  const enterprise = enterpriseValueAud(input.fundamentals);
  const probability = Math.min(1, Math.max(0, input.probability));
  const haircut = Math.min(100, Math.max(0, input.haircutPercent));
  const risked = npv == null ? null : npv * probability * (1 - haircut / 100);
  const reRating = risked != null && enterprise ? (risked / enterprise - 1) * 100 : null;

  return [
    { key: "npv", label: "Project NPV", value: moneyOrDash(npv) },
    { key: "risked", label: "Risked NPV", value: moneyOrDash(risked) },
    { key: "ev", label: "Enterprise value", value: moneyOrDash(enterprise) },
    {
      key: "rerating",
      label: "Implied re-rating",
      value: reRating == null ? "-" : `${reRating >= 0 ? "+" : "−"}${Math.abs(reRating).toFixed(0)}%`,
      tone: reRating == null ? undefined : reRating >= 0 ? "positive" : "negative",
      emphasis: true,
    },
  ];
}

/** Derived strictly from recorded inputs — an unscored company yields no failure modes, not invented ones. */
export function failureModes(fundamentals: MinerFundamentals | undefined): string[] {
  if (!fundamentals) return [];
  const modes: string[] = [];
  const net = netCashAud(fundamentals);
  const enterprise = enterpriseValueAud(fundamentals);

  if ((fundamentals.jurisdictionScore ?? 5) <= 2) {
    modes.push("Jurisdiction and permitting risk can delay or block the mine plan regardless of geology.");
  }
  if ((fundamentals.balanceSheetScore ?? 5) <= 2) {
    modes.push("Balance sheet cover is thin, so a funding round is likely before the plan is delivered.");
  }
  if ((fundamentals.dilutionScore ?? 5) <= 2) {
    modes.push("Issuance history suggests ounces per share can shrink faster than the resource grows.");
  }
  if ((fundamentals.managementScore ?? 5) <= 2) {
    modes.push("Management has not yet delivered against stated plans, so timelines carry an execution discount.");
  }
  if (net != null && net < 0 && !fundamentals.productionOz) {
    modes.push("Debt is carried without production to service it.");
  }
  if (fundamentals.aiscUsdPerOz == null && fundamentals.productionOz) {
    modes.push("No AISC recorded, so operating margin cannot be checked against spot.");
  }
  if (fundamentals.capexAud != null && enterprise != null && fundamentals.capexAud > enterprise) {
    modes.push("Capex exceeds enterprise value, so the project cannot be funded at the current market value without dilution.");
  }
  return modes;
}

export type MagnitudeBar = {
  key: string;
  label: string;
  display: string;
  /** 0-1 against the largest bar in the set, so the group shares one scale. */
  ratio: number;
  tone: "accent" | "positive" | "negative" | "muted";
  note?: string;
};

/**
 * The valuation question is relational — is what shareholders plausibly receive worth more than
 * what the market already pays? Three dollar figures in a column make that a subtraction; on a
 * shared scale it is a glance.
 */
export function valuationBars(input: {
  fundamentals: MinerFundamentals | undefined;
  probability: number;
  haircutPercent: number;
}): MagnitudeBar[] {
  const npv = input.fundamentals?.npvAud ?? null;
  const enterprise = enterpriseValueAud(input.fundamentals);
  const probability = Math.min(1, Math.max(0, input.probability));
  const haircut = Math.min(100, Math.max(0, input.haircutPercent));
  const risked = npv == null ? null : npv * probability * (1 - haircut / 100);
  if (npv == null && enterprise == null) return [];

  const max = Math.max(npv ?? 0, risked ?? 0, enterprise ?? 0, 1);
  const bar = (key: string, label: string, value: number | null, tone: MagnitudeBar["tone"], note?: string): MagnitudeBar => ({
    key,
    label,
    display: moneyOrDash(value),
    ratio: value == null ? 0 : Math.max(0, value / max),
    tone,
    note,
  });

  return [
    bar("npv", "Project NPV", npv, "muted", "before any discount"),
    bar("risked", "Risked NPV", risked, risked != null && enterprise != null && risked >= enterprise ? "positive" : "negative",
      `${(probability * 100).toFixed(0)}% delivered, ${haircut.toFixed(0)}% haircut`),
    bar("ev", "Enterprise value", enterprise, "accent", "what the market pays today"),
  ];
}

/** Relational readings the raw field grid cannot show: conversion, balance, and funding cover. */
export function fundamentalBars(fundamentals: MinerFundamentals | undefined): MagnitudeBar[] {
  if (!fundamentals) return [];
  const bars: MagnitudeBar[] = [];

  if (fundamentals.resourceMoz && fundamentals.reserveMoz != null) {
    const conversion = fundamentals.reserveMoz / fundamentals.resourceMoz;
    bars.push({
      key: "conversion",
      label: "Reserve of resource",
      display: `${(conversion * 100).toFixed(0)}%`,
      ratio: Math.min(1, conversion),
      tone: conversion >= 0.3 ? "positive" : "negative",
      note: `${fundamentals.reserveMoz} of ${fundamentals.resourceMoz} Moz proven`,
    });
  }

  const cash = fundamentals.cashAud ?? 0;
  const debt = fundamentals.debtAud ?? 0;
  if (fundamentals.cashAud != null || fundamentals.debtAud != null) {
    const scale = Math.max(cash, debt, 1);
    bars.push({
      key: "cash",
      label: "Cash",
      display: moneyOrDash(fundamentals.cashAud),
      ratio: cash / scale,
      tone: "positive",
    });
    bars.push({
      key: "debt",
      label: "Debt",
      display: moneyOrDash(fundamentals.debtAud),
      ratio: debt / scale,
      tone: debt > cash ? "negative" : "muted",
      note: cash >= debt ? "covered by cash" : "exceeds cash",
    });
  }

  const enterprise = enterpriseValueAud(fundamentals);
  if (fundamentals.capexAud && enterprise) {
    const cover = enterprise / fundamentals.capexAud;
    bars.push({
      key: "capex",
      label: "Capex cover",
      display: `${cover.toFixed(2)}x`,
      ratio: Math.min(1, cover),
      tone: cover >= 1 ? "positive" : "negative",
      note: `${moneyOrDash(fundamentals.capexAud)} to build`,
    });
  }

  return bars;
}
