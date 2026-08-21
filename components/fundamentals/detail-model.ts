import type { MinerFundamentals } from "@/lib/storage";
import type { Holding } from "@/northstar/types";
import { dateOrDash, money, moneyOrDash, numberOrDash } from "./model";

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
  gauges: SouthernStarGauge[];
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


export function fundamentalQualityScore(fundamentals: MinerFundamentals | undefined) {
  const scores = [fundamentals?.jurisdictionScore, fundamentals?.balanceSheetScore, fundamentals?.dilutionScore, fundamentals?.managementScore]
    .filter((value): value is number => value != null);
  if (!scores.length) return null;
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return Math.round(Math.min(100, Math.max(0, average * 20)));
}

export function valuationScore(fundamentals: MinerFundamentals | undefined) {
  const npv = fundamentals?.npvAud ?? null;
  const enterprise = enterpriseValueAud(fundamentals);
  if (npv == null || !enterprise || enterprise <= 0) return null;
  return Math.round(Math.min(100, Math.max(0, 50 + (npv / enterprise - 1) * 25)));
}

export function stageMethodology(fundamentals: MinerFundamentals | undefined) {
  const stage = (fundamentals?.projectStage ?? "").toLowerCase();
  if (fundamentals?.productionOz || /produc|operat/.test(stage)) return "Producer model: margins, balance sheet, production quality, jurisdiction, management and growth.";
  if (/develop|permitting|study|feasibility|pre[- ]?production/.test(stage)) return "Developer model: resource quality, NPV/market cap, IRR, capex funding, permitting, jurisdiction and timeline.";
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
  relativeScore: number | null;
  relativeVelocity: number | null;
  entryScore?: number | null;
}) {
  const fundamental = fundamentalQualityScore(input.fundamentals);
  const valuation = valuationScore(input.fundamentals);
  const entry = input.entryScore ?? null;
  const gauges: SouthernStarGauge[] = [
    {
      key: "fundamental",
      label: "F",
      score: fundamental,
      tone: scoreTone(fundamental),
      status: fundamental == null ? "Not scored" : fundamental >= 75 ? "Business" : fundamental >= 45 ? "Mixed" : "Weak",
      note: stageMethodology(input.fundamentals),
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
      status: valuation == null ? "Not valued" : valuation >= 75 ? "Discount" : valuation >= 45 ? "Fair/mixed" : "Stretched",
      note: valuation == null ? "Needs sourced NPV and enterprise value; valuation is separate from business quality." : "NPV versus enterprise value; a good asset can still be a poor price.",
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
  const strongF = fundamental != null && fundamental >= 70;
  const weakF = fundamental != null && fundamental < 50;
  const strongR = input.relativeScore != null && input.relativeScore >= 70;
  const weakR = input.relativeScore != null && input.relativeScore < 50;
  const goodEntry = entry != null && entry >= 65;
  const poorEntry = entry != null && entry < 50;
  let label = "WATCH";
  let note = "Signals are mixed; inspect the disagreement before allocating.";
  if (strongF && strongR && goodEntry) {
    label = "OWN / ADD CANDIDATE";
    note = "Quality, market leadership and entry condition are aligned.";
  } else if (strongF && strongR && (poorEntry || entry == null)) {
    label = "QUALITY LEADER / WAIT";
    note = "Fundamentals and relative strength agree, but Entry Score has not confirmed an add point.";
  } else if (strongF && weakR) {
    label = "QUALITY / NOT CURRENTLY EARNING CAPITAL";
    note = "Fundamentals are strong but the market has not yet confirmed relative leadership.";
  } else if (weakF && strongR) {
    label = "SPECULATIVE MOMENTUM";
    note = "Relative strength is strong, but fundamentals do not clear the risk gate.";
  } else if (weakF && weakR) {
    label = "AVOID / RESEARCH ONLY";
    note = "Neither fundamentals nor relative strength currently justify capital.";
  } else if (strongR && input.relativeVelocity != null && input.relativeVelocity > 0) {
    label = "RELATIVE IMPROVEMENT";
    note = "Market leadership is improving; fundamentals and entry need confirmation.";
  }
  return { allocationScore, label, note, gauges } satisfies SouthernStarAllocationRead;
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
    { key: "production", label: "Production oz", value: numberOrDash(fundamentals?.productionOz) },
    { key: "aisc", label: "AISC US$/oz", value: numberOrDash(fundamentals?.aiscUsdPerOz) },
    { key: "resource", label: "Resource Moz", value: numberOrDash(fundamentals?.resourceMoz) },
    { key: "reserve", label: "Reserve Moz", value: numberOrDash(fundamentals?.reserveMoz) },
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
