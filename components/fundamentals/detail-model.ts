import type { MinerFundamentals } from "@/lib/storage";
import type { Holding } from "@/northstar/types";
import { dateOrDash, money, moneyOrDash, numberOrDash } from "./model";

export type RiskTone = "good" | "warning" | "bad";

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
