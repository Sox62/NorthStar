import type { MinerFundamentals, StudyStage } from "@/lib/storage";

/**
 * Freshness is not one thing. An observation can be current, merely old, or known-wrong because
 * something happened after it was taken — and the last of those is not a weaker version of the
 * second, it is a different claim. A cash balance from March is a reasonable approximation in
 * May and a fiction after an August placement.
 *
 * Only "stale" is derivable from a clock. "Superseded" needs an event, so SouthernStar records
 * the event — a capital raise date, a higher-tier study under way — and derives the state, rather
 * than asking anyone to maintain a status field that rots at the same rate as the data it labels.
 */
export type EvidenceState = "current" | "stale" | "superseded" | "unknown";

export const STUDY_STAGE_LABELS: Record<StudyStage, string> = {
  scoping: "Scoping Study",
  pfs: "Pre-Feasibility Study",
  dfs: "Feasibility Study",
};

/** Confidence ladder. Only PFS and above may price a valuation. */
const STUDY_RANK: Record<StudyStage, number> = { scoping: 1, pfs: 2, dfs: 3 };

/**
 * How long a figure of each kind stays a fair approximation. A market capitalisation drifts
 * within weeks; a balance sheet holds until roughly the next quarterly.
 */
export const HALF_LIFE_DAYS = { balance: 120, marketCap: 45 } as const;

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const start = Date.parse(from + "T00:00:00Z");
  const end = Date.parse(to + "T00:00:00Z");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

export function evidenceState(input: {
  asOf: string | null;
  /** Any figure taken before this date is known-wrong rather than old. */
  supersededAfter?: string | null;
  halfLifeDays: number;
  asAt?: string;
}): EvidenceState {
  const { asOf, supersededAfter, halfLifeDays } = input;
  const asAt = input.asAt ?? todayIso();
  if (!asOf) return "unknown";
  if (supersededAfter && supersededAfter > asOf) return "superseded";
  const age = daysBetween(asOf, asAt);
  if (age == null) return "unknown";
  return age > halfLifeDays ? "stale" : "current";
}

/** Cash and debt. Falls back to the record's general asOfDate when no balance date is recorded. */
export function balanceState(fundamentals: MinerFundamentals | undefined, asAt?: string): EvidenceState {
  if (!fundamentals) return "unknown";
  return evidenceState({
    asOf: fundamentals.balanceAsOfDate ?? fundamentals.asOfDate,
    supersededAfter: fundamentals.lastCapitalEventDate,
    halfLifeDays: HALF_LIFE_DAYS.balance,
    asAt,
  });
}

export function marketCapState(fundamentals: MinerFundamentals | undefined, asAt?: string): EvidenceState {
  if (!fundamentals) return "unknown";
  return evidenceState({
    asOf: fundamentals.marketCapAsOfDate ?? fundamentals.asOfDate,
    supersededAfter: fundamentals.lastCapitalEventDate,
    halfLifeDays: HALF_LIFE_DAYS.marketCap,
    asAt,
  });
}

export type EconomicsRead = {
  state: EvidenceState;
  /** May this NPV price a valuation, or is it history? */
  eligible: boolean;
  reason: string;
  stage: StudyStage | null;
  stageLabel: string | null;
  studyDate: string | null;
};

/**
 * Whether the recorded project economics may feed V.
 *
 * An unrecorded stage keeps the previous behaviour, so existing records do not silently lose
 * their valuation — recording the stage is what arms the gate, exactly as with quantityUnit and
 * costBasis. The gate itself is a gate and not a coefficient: there is nothing to calibrate a
 * per-stage haircut against, so a study either prices the asset or is shown as history.
 */
export function economicsRead(input: {
  fundamentals: MinerFundamentals | undefined;
  /** Developers must fund a build, so their economics need a capital cost to be priceable. */
  requiresCapex: boolean;
  asAt?: string;
}): EconomicsRead {
  const { fundamentals, requiresCapex } = input;
  const stage = fundamentals?.economicStudyStage ?? null;
  const stageLabel = stage ? STUDY_STAGE_LABELS[stage] : null;
  const studyDate = fundamentals?.economicStudyDate ?? null;
  const base = { stage, stageLabel, studyDate };

  if (!fundamentals || fundamentals.npvAud == null) {
    return { ...base, state: "unknown", eligible: false, reason: "No project economics recorded." };
  }

  const next = fundamentals.nextStudyStage;
  const superseded = Boolean(stage && next && STUDY_RANK[next] > STUDY_RANK[stage]);
  if (superseded) {
    return {
      ...base,
      state: "superseded",
      eligible: false,
      reason: `A ${STUDY_STAGE_LABELS[next!].toLowerCase()} is under way, so the ${stageLabel?.toLowerCase()} economics are history rather than a current price.`,
    };
  }

  if (stage === "scoping") {
    return {
      ...base,
      state: "current",
      eligible: false,
      reason: "Scoping-study economics are too low-confidence to price an asset; shown as history.",
    };
  }

  if (requiresCapex && fundamentals.capexAud == null) {
    return {
      ...base,
      state: "unknown",
      eligible: false,
      reason: "No capital cost recorded, so the funding dilution cannot be applied and the NPV would be scored unrisked.",
    };
  }

  return {
    ...base,
    state: "current",
    eligible: true,
    reason: stageLabel ? `${stageLabel} economics.` : "Study stage not recorded; scored on the previous convention.",
  };
}

export const EVIDENCE_LABELS: Record<EvidenceState, string> = {
  current: "current",
  stale: "stale",
  superseded: "superseded",
  unknown: "undated",
};
