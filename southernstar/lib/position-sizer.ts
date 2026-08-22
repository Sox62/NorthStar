export type SizerInput = {
  /** Whole-family NAV; risk budget is expressed against this, not the account. */
  familyNavAud: number;
  riskPercent: number;
  entryAud: number;
  invalidationAud: number;
  /** Deployable cash in the chosen account. */
  availableCashAud: number;
  /** Current market value already held in this theme, across the family. */
  themeValueAud: number;
  themeTargetPercent: number | null;
  /** Policy ceiling for a single position, as a percent of family NAV. */
  maxPositionPercent: number;
};

export type SizerResult = {
  riskBudgetAud: number;
  stopDistanceAud: number;
  stopDistancePercent: number;
  units: number;
  positionValueAud: number;
  positionPercentOfNav: number;
  /** False when the inputs cannot produce a size at all. */
  sizeable: boolean;
  blocker: string | null;
};

export type CheckTone = "good" | "warning" | "bad";
export type PreTradeCheck = {
  key: string;
  label: string;
  detail: string;
  status: string;
  tone: CheckTone;
  /**
   * Fraction of this check's limit consumed, so the UI can draw the magnitude rather than only
   * print it. 1 is exactly at the limit; above 1 is over. Null when the check has no limit to
   * measure against.
   */
  ratio: number | null;
  /** What the bar is measured against, for the axis caption. */
  limitLabel: string | null;
};

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const EMPTY: SizerResult = {
  riskBudgetAud: 0,
  stopDistanceAud: 0,
  stopDistancePercent: 0,
  units: 0,
  positionValueAud: 0,
  positionPercentOfNav: 0,
  sizeable: false,
  blocker: null,
};

/**
 * Size follows from dollars at risk divided by stop distance. The stop is an input, never an
 * output — tightening it to justify a bigger position is the failure mode this guards against.
 */
export function deriveSize(input: SizerInput): SizerResult {
  const riskBudgetAud = Math.max(0, input.familyNavAud) * Math.max(0, input.riskPercent) / 100;
  const stopDistanceAud = input.entryAud - input.invalidationAud;

  if (!(input.entryAud > 0)) return { ...EMPTY, riskBudgetAud, blocker: "Entry price is required." };
  if (!(input.invalidationAud > 0)) return { ...EMPTY, riskBudgetAud, blocker: "Set the technical invalidation from the chart." };
  if (stopDistanceAud <= 0) {
    return { ...EMPTY, riskBudgetAud, blocker: "Invalidation must sit below the entry price for a long position." };
  }
  if (riskBudgetAud <= 0) return { ...EMPTY, riskBudgetAud, blocker: "Risk budget is zero." };

  const units = riskBudgetAud / stopDistanceAud;
  const positionValueAud = units * input.entryAud;

  return {
    riskBudgetAud: round(riskBudgetAud),
    stopDistanceAud: round(stopDistanceAud, 4),
    stopDistancePercent: round((stopDistanceAud / input.entryAud) * 100),
    units: Math.floor(units),
    positionValueAud: round(Math.floor(units) * input.entryAud),
    positionPercentOfNav: input.familyNavAud ? round((Math.floor(units) * input.entryAud) / input.familyNavAud * 100) : 0,
    sizeable: Math.floor(units) > 0,
    blocker: Math.floor(units) > 0 ? null : "Risk budget is smaller than one unit at this stop distance.",
  };
}

const WIDE_STOP_PERCENT = 35;
const MAX_RISK_PERCENT = 2;

const aud = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

export function preTradeChecks(input: SizerInput, result: SizerResult): PreTradeCheck[] {
  const checks: PreTradeCheck[] = [];

  checks.push(result.stopDistanceAud > 0
    ? {
        key: "invalidation",
        label: "Invalidation below entry",
        detail: `Stop is ${result.stopDistancePercent.toFixed(2)}% below entry`,
        status: result.stopDistancePercent < 1 ? "Very tight" : result.stopDistancePercent > 35 ? "Very wide" : "Workable",
        tone: result.stopDistancePercent < 1 ? "warning" : result.stopDistancePercent > 35 ? "warning" : "good",
        ratio: result.stopDistancePercent / WIDE_STOP_PERCENT,
        limitLabel: `${WIDE_STOP_PERCENT}% is a very wide stop`,
      }
    : { key: "invalidation", label: "Invalidation below entry", detail: result.blocker ?? "No stop distance", status: "Blocked", tone: "bad", ratio: null, limitLabel: null });

  const fundable = result.positionValueAud <= input.availableCashAud;
  checks.push({
    key: "liquidity",
    label: "Funded by deployable cash",
    detail: `${aud(result.positionValueAud)} against ${aud(input.availableCashAud)} available`,
    status: fundable ? "Funded" : "Short of cash",
    tone: fundable ? "good" : "bad",
    ratio: input.availableCashAud > 0 ? result.positionValueAud / input.availableCashAud : null,
    limitLabel: `${aud(input.availableCashAud)} deployable`,
  });

  const withinCap = result.positionPercentOfNav <= input.maxPositionPercent;
  checks.push({
    key: "weight",
    label: "Single-position ceiling",
    detail: `${result.positionPercentOfNav.toFixed(2)}% of family NAV against a ${input.maxPositionPercent}% cap`,
    status: withinCap ? "Within cap" : "Over cap",
    tone: withinCap ? "good" : "bad",
    ratio: input.maxPositionPercent > 0 ? result.positionPercentOfNav / input.maxPositionPercent : null,
    limitLabel: `${input.maxPositionPercent}% ceiling`,
  });

  const themeAfter = input.familyNavAud
    ? ((input.themeValueAud + result.positionValueAud) / input.familyNavAud) * 100
    : 0;
  const themeTarget = input.themeTargetPercent;
  checks.push({
    key: "theme",
    label: "Theme exposure after trade",
    detail: themeTarget == null
      ? `${themeAfter.toFixed(2)}% of NAV; no target set for this theme`
      : `${themeAfter.toFixed(2)}% of NAV against a ${themeTarget.toFixed(2)}% target`,
    status: themeTarget == null ? "No target" : themeAfter > themeTarget ? "Over target" : "Within target",
    tone: themeTarget == null ? "warning" : themeAfter > themeTarget ? "warning" : "good",
    ratio: themeTarget ? themeAfter / themeTarget : null,
    limitLabel: themeTarget ? `${themeTarget.toFixed(2)}% target` : null,
  });

  checks.push({
    key: "risk",
    label: "Capital at risk if stopped",
    detail: `${aud(result.riskBudgetAud)} is ${input.riskPercent.toFixed(2)}% of family NAV`,
    status: result.sizeable ? "Accepted" : "No size",
    tone: result.sizeable ? "good" : "bad",
    ratio: MAX_RISK_PERCENT > 0 ? input.riskPercent / MAX_RISK_PERCENT : null,
    limitLabel: `${MAX_RISK_PERCENT}% is the widest budget`,
  });

  return checks;
}

/** The trade is armable only when nothing hard-blocks it; warnings are for the operator to weigh. */
export function sizerVerdict(checks: PreTradeCheck[], result: SizerResult) {
  if (!result.sizeable) return { armable: false, text: result.blocker ?? "Inputs do not produce a position." };
  const blocked = checks.filter((check) => check.tone === "bad");
  if (blocked.length) return { armable: false, text: `Blocked: ${blocked.map((check) => check.status.toLowerCase()).join(", ")}.` };
  const warnings = checks.filter((check) => check.tone === "warning");
  if (warnings.length) return { armable: true, text: `Armable with ${warnings.length} caution${warnings.length === 1 ? "" : "s"} to weigh.` };
  return { armable: true, text: "All pre-trade checks pass." };
}
