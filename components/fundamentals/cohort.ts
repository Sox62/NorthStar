import type { CostBasis, MinerFundamentals, QuantityUnit, ReportingPeriod } from "@/lib/storage";

export type MetalKey = "gold" | "silver" | "uranium" | "copper" | "platinum" | "other";

/**
 * SouthernStar scores cost, scale and per-unit valuation against the metal's own peer group
 * rather than against fixed thresholds.
 *
 * The fixed bands were silver-calibrated on cost and gold-calibrated on scale, so every gold
 * producer sat in the worst cost bucket permanently while every silver producer maxed out
 * production scale — roughly 40 of the 100 fundamental points decided by which metal the
 * company happened to mine. Anchoring on the cohort median removes the calibration problem
 * instead of moving it, and it is how a cost curve is actually read: position against peers.
 *
 * Below MIN_COHORT the component reports null rather than guessing, in keeping with the rule
 * that absence of evidence must never read as evidence of weakness.
 */
export const MIN_COHORT = 3;

const METAL_PATTERNS: Array<[MetalKey, RegExp]> = [
  ["gold", /gold/],
  ["silver", /silver/],
  ["uranium", /uranium|u3o8/],
  ["copper", /copper/],
  ["platinum", /platinum|palladium|pgm/],
];

/** The first metal named wins: "Silver / gold" is a silver company, "Gold / copper" a gold one. */
export function primaryMetalKey(fundamentals: MinerFundamentals | undefined): MetalKey {
  const text = (fundamentals?.primaryMetal ?? "").toLowerCase();
  let best: { key: MetalKey; index: number } | null = null;
  for (const [key, pattern] of METAL_PATTERNS) {
    const index = text.search(pattern);
    if (index >= 0 && (best == null || index < best.index)) best = { key, index };
  }
  return best?.key ?? "other";
}

/**
 * The unit is recorded per company rather than guessed from the metal, because the field names
 * (`productionOz`, `resourceMoz`, `aiscUsdPerOz`) lie for anything quoted per pound. Null reads
 * as ounces so rows saved before the column existed keep their meaning.
 */
export function quantityUnitOf(fundamentals: MinerFundamentals | undefined): QuantityUnit {
  return fundamentals?.quantityUnit ?? "oz";
}

export function reportingPeriodOf(fundamentals: MinerFundamentals | undefined): ReportingPeriod {
  return fundamentals?.productionPeriod ?? "year";
}

const PERIOD_MULTIPLE: Record<ReportingPeriod, number> = { quarter: 4, half: 2, year: 1 };

/**
 * Production scaled to a full year. `productionOz` is captured from whatever the company last
 * reported — a quarter for one name, a full year for another — so comparing the raw figures
 * across a cohort silently compares a quarter with a year. Everything that ranks or prices
 * production must go through this.
 */
export function annualisedProduction(fundamentals: MinerFundamentals | undefined) {
  if (fundamentals?.productionOz == null) return null;
  return fundamentals.productionOz * PERIOD_MULTIPLE[reportingPeriodOf(fundamentals)];
}

export function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type CohortRead = { metal: MetalKey; unit: QuantityUnit; basis: CostBasis | null; size: number; median: number | null };

export const COST_BASES: CostBasis[] = ["aisc_byproduct", "aisc_ageq", "cash_cost", "cas"];

export const COST_BASIS_LABELS: Record<CostBasis, string> = {
  aisc_byproduct: "AISC, net of by-product credits",
  aisc_ageq: "AISC per equivalent ounce",
  cash_cost: "Cash cost (excludes sustaining capital)",
  cas: "Costs applicable to sales",
};

/** Null basis means the record has not said which cost measure it holds, so it matches only other unstated ones. */
export function costBasisOf(fundamentals: MinerFundamentals | undefined): CostBasis | null {
  return fundamentals?.costBasis ?? null;
}

/**
 * The peers that share both the metal and the recorded unit and actually carry the metric, plus
 * their median. Matching on unit as well as metal is what stops a per-pound figure being ranked
 * against per-ounce ones.
 */
export function cohortMedianFor(
  fundamentals: MinerFundamentals | undefined,
  cohort: MinerFundamentals[],
  pick: (peer: MinerFundamentals) => number | null,
  options: { matchCostBasis?: boolean } = {},
): CohortRead {
  const metal = primaryMetalKey(fundamentals);
  const unit = quantityUnitOf(fundamentals);
  const basis = options.matchCostBasis ? costBasisOf(fundamentals) : null;
  const values = cohort
    .filter((peer) => primaryMetalKey(peer) === metal && quantityUnitOf(peer) === unit)
    .filter((peer) => !options.matchCostBasis || costBasisOf(peer) === basis)
    .map(pick)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  return { metal, unit, basis, size: values.length, median: median(values) };
}

/**
 * Score a value against its cohort median on a log scale, so the result is symmetric: `spread`
 * times better than the median earns full marks, `spread` times worse earns none. Costs move in
 * a far narrower band than production scale, so each caller sets its own spread.
 */
export function cohortAnchoredScore(input: {
  value: number | null;
  cohort: CohortRead;
  lowerIsBetter: boolean;
  spread: number;
  max: number;
}) {
  const { value, cohort, lowerIsBetter, spread, max } = input;
  if (value == null || cohort.median == null || cohort.median <= 0 || cohort.size < MIN_COHORT) return null;
  // A negative all-in cost is by-product credits paying for the mine — the best cost position
  // there is, not a number to take a logarithm of.
  if (value <= 0) return lowerIsBetter ? max : 0;
  const ratio = lowerIsBetter ? cohort.median / value : value / cohort.median;
  const share = 0.5 + 0.5 * Math.log(ratio) / Math.log(spread);
  return Math.min(max, Math.max(0, share * max));
}

/** Costs sit in a narrow band: a third below the same-metal median is already top of the curve. */
export const COST_SPREAD = 1.35;
/** Production and resource scale span orders of magnitude. */
export const SCALE_SPREAD = 3;
/** Per-unit valuation multiples: half the peer median is cheap, twice it is dear. */
export const VALUATION_SPREAD = 2;
