import type { PriceBook, StoredDailyPrice, StoredFxRate } from "@/lib/storage";
import { buildInstrumentHistory, type RatioHistoryPoint } from "@/southernstar/lib/ratio-engine";

export type CompositeDirection = "positive" | "inverse";
export type CompositeSeriesBasis = "raw_market" | "fx_normalised";
export type CompositeResultStatus = "valid" | "partial" | "stale" | "insufficient_data";
export type CompositeComponentStatus = "valid" | "missing" | "stale" | "insufficient_data";
export type CompositeTrendDirection = "up" | "down" | "flat" | "unknown";
export type MovingAverageRelationship = "above" | "below" | "at" | "unavailable";

export type CompositeInstrumentRef = {
  symbol: string;
  exchange?: string;
  name: string;
  currency: string;
};

export type CompositeMetricWeights = {
  priceVsMovingAverage: number;
  movingAverageSlope: number;
  roc6m: number;
  roc12m: number;
};

export type CompositeScoringConfig = {
  basis: CompositeSeriesBasis;
  movingAverageDays: number;
  slopeLookbackDays: number;
  roc6mDays: number;
  roc12mDays: number;
  metricWeights: CompositeMetricWeights;
  minimumEvidenceWeight: number;
  maxCarryForwardDays: number;
  denominatorMaxCarryForwardDays?: number;
  staleAfterDays: number;
};

export type CompositeComponent = {
  id: string;
  name: string;
  description: string;
  numerator: CompositeInstrumentRef;
  denominator?: CompositeInstrumentRef;
  weight: number;
  direction: CompositeDirection;
  scoringConfig: CompositeScoringConfig;
};

export type CompositeThreshold = {
  id: string;
  label: string;
  min: number;
  max: number;
};

export type CompositeMissingDataPolicy = {
  mode: "require_all" | "renormalize_available";
  minimumAvailableWeight: number;
};

export type CompositeIndexDefinition = {
  id: string;
  name: string;
  description: string;
  calculationVersion: string;
  components: CompositeComponent[];
  thresholds: CompositeThreshold[];
  missingDataPolicy: CompositeMissingDataPolicy;
};

export type CompositeSeriesPoint = {
  date: string;
  value: number;
  rawValue: number;
  fxNormalisedValue: number;
  numerator: number;
  denominator: number | null;
  numeratorDate: string;
  denominatorDate: string | null;
  source: string;
};

export type CompositeComponentCalculation = {
  id: string;
  name: string;
  description: string;
  weight: number;
  direction: CompositeDirection;
  status: CompositeComponentStatus;
  score: number | null;
  value: number | null;
  numeratorValue: number | null;
  denominatorValue: number | null;
  weightedContribution: number | null;
  trendDirection: CompositeTrendDirection;
  sixMonthRoc: number | null;
  twelveMonthRoc: number | null;
  movingAverage: number | null;
  movingAverageRelationship: MovingAverageRelationship;
  movingAverageSlope: number | null;
  evidenceWeight: number;
  evidenceDetail: Array<{ key: keyof CompositeMetricWeights; label: string; points: number; max: number; available: boolean; passed: boolean | null }>;
  asOfDate: string | null;
  stale: boolean;
  messages: string[];
};

export type CompositeIndexCalculation = {
  definitionId: string;
  name: string;
  calculationVersion: string;
  date: string;
  asOfDate: string | null;
  calculatedAt: string;
  score: number | null;
  status: CompositeResultStatus;
  regimeId: string | null;
  regimeLabel: string | null;
  availableWeight: number;
  missingWeight: number;
  components: CompositeComponentCalculation[];
  messages: string[];
};

type ComponentSeries = {
  component: CompositeComponent;
  points: CompositeSeriesPoint[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const FLAT_EPSILON = 0.000001;

export function validateCompositeDefinition(definition: CompositeIndexDefinition) {
  if (!definition.components.length) throw new Error(`${definition.name} has no components.`);
  const weightTotal = definition.components.reduce((sum, component) => sum + component.weight, 0);
  if (Math.abs(weightTotal - 100) > 0.000001) {
    throw new Error(`${definition.name} component weights must total 100%; found ${weightTotal}.`);
  }
  for (const component of definition.components) {
    const scoreWeight = metricWeightTotal(component.scoringConfig.metricWeights);
    if (scoreWeight <= 0) throw new Error(`${component.name} scoring weights must be positive.`);
  }
}

export function calculateCompositeIndex(definition: CompositeIndexDefinition, book: Pick<PriceBook, "prices" | "fxRates">, calculatedAt = new Date().toISOString()): CompositeIndexCalculation[] {
  validateCompositeDefinition(definition);
  const componentSeries = definition.components.map((component) => ({
    component,
    points: buildComponentSeries(component, book.prices, book.fxRates),
  }));
  const dates = [...new Set(componentSeries.flatMap((series) => series.points.map((point) => point.date)))].sort();

  return dates.map((date) => calculateCompositePoint(definition, componentSeries, date, calculatedAt));
}

export function latestCompositeCalculation(definition: CompositeIndexDefinition, book: Pick<PriceBook, "prices" | "fxRates">, calculatedAt = new Date().toISOString()) {
  return calculateCompositeIndex(definition, book, calculatedAt).at(-1) ?? null;
}

export function regimeForScore(definition: CompositeIndexDefinition, score: number | null) {
  if (score == null) return null;
  return definition.thresholds.find((threshold, index) => {
    const isLast = index === definition.thresholds.length - 1;
    return score >= threshold.min && (score < threshold.max || (isLast && score <= threshold.max));
  }) ?? null;
}

export function compositeScoreChanges(points: Array<{ date: string; score: number | null }>, latest = points.at(-1)) {
  if (!latest || latest.score == null) return { day: null, week: null, month: null };
  const scoredLatest = { date: latest.date, score: latest.score };
  return {
    day: scoreChange(points, scoredLatest, 1),
    week: scoreChange(points, scoredLatest, 7),
    month: scoreChange(points, scoredLatest, 30),
  };
}

export function filterCompositeRange<T extends { date: string }>(points: T[], range: "3M" | "6M" | "1Y" | "3Y" | "5Y" | "10Y" | "MAX") {
  if (range === "MAX" || points.length < 2) return points;
  const latest = points.at(-1);
  if (!latest) return points;
  const days = range === "3M" ? 92
    : range === "6M" ? 183
      : range === "1Y" ? 365.25
        : range === "3Y" ? 3 * 365.25
          : range === "5Y" ? 5 * 365.25
            : 10 * 365.25;
  const cutoff = dateTime(latest.date) - days * DAY_MS;
  const filtered = points.filter((point) => dateTime(point.date) >= cutoff);
  return filtered.length >= 2 ? filtered : points;
}

function calculateCompositePoint(definition: CompositeIndexDefinition, componentSeries: ComponentSeries[], date: string, calculatedAt: string): CompositeIndexCalculation {
  const components = componentSeries.map((series) => calculateComponentPoint(series.component, series.points, date));
  const availableComponents = components.filter((component) => component.status === "valid" && component.score != null);
  const availableWeight = availableComponents.reduce((sum, component) => sum + component.weight, 0);
  const missingWeight = Math.max(0, 100 - availableWeight);
  const messages = components.flatMap((component) => component.messages.map((message) => `${component.name}: ${message}`));

  let score: number | null = null;
  let status: CompositeResultStatus = "valid";
  if (!availableComponents.length) {
    status = "insufficient_data";
    messages.push("No components have enough evidence to calculate the index.");
  } else if (definition.missingDataPolicy.mode === "require_all" && availableWeight < 99.999999) {
    status = components.some((component) => component.status === "stale") ? "stale" : "partial";
    messages.push(`Available component weight is ${formatWeight(availableWeight)}%; the definition requires all components.`);
  } else if (availableWeight < definition.missingDataPolicy.minimumAvailableWeight) {
    status = "insufficient_data";
    messages.push(`Available component weight is ${formatWeight(availableWeight)}%; minimum is ${definition.missingDataPolicy.minimumAvailableWeight}%.`);
  } else if (definition.missingDataPolicy.mode === "renormalize_available" && availableWeight < 99.999999) {
    status = components.some((component) => component.status === "stale") ? "stale" : "partial";
    score = clamp(availableComponents.reduce((sum, component) => sum + (component.score ?? 0) * component.weight / availableWeight, 0), 0, 100);
  }

  if (score == null && status === "valid") {
    score = clamp(availableComponents.reduce((sum, component) => sum + (component.weightedContribution ?? 0), 0), 0, 100);
  }

  const regime = regimeForScore(definition, score);
  const asOfDate = components
    .map((component) => component.asOfDate)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    definitionId: definition.id,
    name: definition.name,
    calculationVersion: definition.calculationVersion,
    date,
    asOfDate,
    calculatedAt,
    score: score == null ? null : round(score, 2),
    status,
    regimeId: regime?.id ?? null,
    regimeLabel: regime?.label ?? null,
    availableWeight: round(availableWeight, 2),
    missingWeight: round(missingWeight, 2),
    components,
    messages,
  };
}

function buildComponentSeries(component: CompositeComponent, prices: StoredDailyPrice[], fxRates: StoredFxRate[]): CompositeSeriesPoint[] {
  const history = component.scoringConfig.basis === "raw_market" ? buildRawInstrumentHistory : buildInstrumentHistory;
  const numerator = history(prices, fxRates, component.numerator);
  if (!component.denominator) {
    return numerator.map((point) => ({
      date: point.date,
      value: valueForBasis(point, component.scoringConfig.basis),
      rawValue: point.close,
      fxNormalisedValue: point.valueAud,
      numerator: point.close,
      denominator: null,
      numeratorDate: point.date,
      denominatorDate: null,
      source: point.source,
    }));
  }

  const denominator = history(prices, fxRates, component.denominator);
  return buildRatioJoinSeries(
    numerator,
    denominator,
    component.scoringConfig.basis,
    component.scoringConfig.maxCarryForwardDays,
    component.scoringConfig.denominatorMaxCarryForwardDays ?? component.scoringConfig.maxCarryForwardDays,
  );
}

function buildRawInstrumentHistory(prices: StoredDailyPrice[], _fxRates: StoredFxRate[], instrument: CompositeInstrumentRef): RatioHistoryPoint[] {
  const byDate = new Map<string, StoredDailyPrice>();
  for (const row of prices) {
    if (!priceMatchesInstrument(row, instrument)) continue;
    const current = byDate.get(row.priceDate);
    if (!current || current.retrievedAt < row.retrievedAt) byDate.set(row.priceDate, row);
  }
  return [...byDate.values()]
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate) || left.retrievedAt.localeCompare(right.retrievedAt))
    .flatMap((row): RatioHistoryPoint[] => {
      if (!Number.isFinite(row.close) || row.close <= 0) return [];
      return [{
        date: row.priceDate,
        close: row.close,
        currency: row.currency.trim().toUpperCase(),
        fxRateToAud: 1,
        valueAud: row.close,
        source: row.source,
      }];
    });
}

function priceMatchesInstrument(row: StoredDailyPrice, instrument: CompositeInstrumentRef) {
  return row.symbol.trim().toUpperCase() === instrument.symbol.trim().toUpperCase()
    && (!instrument.exchange || canonicalMarket(row.exchange) === canonicalMarket(instrument.exchange));
}

function canonicalMarket(value: string | null | undefined) {
  const exchange = (value ?? "").trim().toUpperCase();
  if (["CA", "CANADA", "TSX", "TSXV", "TSE", "CVE", "TSX/TSXV"].includes(exchange)) return "CA";
  if (["AU", "ASX", "CHIXAU"].includes(exchange)) return "ASX";
  if (["US", "USA", "NYSE", "NASDAQ", "AMEX", "ARCA", "NYSEARCA"].includes(exchange)) return "US";
  return exchange;
}

function buildRatioJoinSeries(
  numerator: RatioHistoryPoint[],
  denominator: RatioHistoryPoint[],
  basis: CompositeSeriesBasis,
  numeratorCarryDays: number,
  denominatorCarryDays: number,
): CompositeSeriesPoint[] {
  const leftByDate = new Map(numerator.map((point) => [point.date, point]));
  const rightByDate = new Map(denominator.map((point) => [point.date, point]));
  const dates = [...new Set([...leftByDate.keys(), ...rightByDate.keys()])].sort();
  let latestLeft: RatioHistoryPoint | undefined;
  let latestRight: RatioHistoryPoint | undefined;
  const points: CompositeSeriesPoint[] = [];

  for (const date of dates) {
    latestLeft = leftByDate.get(date) ?? latestLeft;
    latestRight = rightByDate.get(date) ?? latestRight;
    if (!latestLeft || !latestRight || latestRight.close <= 0 || latestRight.valueAud <= 0) continue;
    if (!withinCarryForwardWindow(latestLeft.date, date, numeratorCarryDays)) continue;
    if (!withinCarryForwardWindow(latestRight.date, date, denominatorCarryDays)) continue;
    const rawValue = latestLeft.close / latestRight.close * 100;
    const fxNormalisedValue = latestLeft.valueAud / latestRight.valueAud * 100;
    points.push({
      date,
      value: basis === "raw_market" ? rawValue : fxNormalisedValue,
      rawValue,
      fxNormalisedValue,
      numerator: latestLeft.close,
      denominator: latestRight.close,
      numeratorDate: latestLeft.date,
      denominatorDate: latestRight.date,
      source: `${latestLeft.source} / ${latestRight.source}`,
    });
  }

  return points;
}

function calculateComponentPoint(component: CompositeComponent, series: CompositeSeriesPoint[], date: string): CompositeComponentCalculation {
  const index = series.findIndex((point) => point.date === date);
  const config = component.scoringConfig;
  const messages: string[] = [];
  if (index < 0) {
    messages.push("No aligned market data for this date.");
    return emptyComponent(component, "missing", date, messages);
  }

  const point = series[index]!;
  const movingAverage = movingAverageAt(series, index, config.movingAverageDays);
  const previousMovingAverage = movingAverageAt(series, index - config.slopeLookbackDays, config.movingAverageDays);
  const sixMonth = lookbackPoint(series, point.date, config.roc6mDays);
  const twelveMonth = lookbackPoint(series, point.date, config.roc12mDays);
  const previousPoint = previousSeriesPoint(series, index);
  const inputDates = [point.numeratorDate, point.denominatorDate].filter((value): value is string => Boolean(value));
  const oldestInputDate = inputDates.sort()[0] ?? point.date;
  const stale = daysBetween(oldestInputDate, point.date) > config.staleAfterDays;
  const evidence = scoreEvidence({
    point,
    component,
    movingAverage,
    previousMovingAverage,
    sixMonth,
    twelveMonth,
  });

  if (movingAverage == null) messages.push(`${config.movingAverageDays}-day moving average is unavailable.`);
  if (!sixMonth) messages.push("6-month rate of change is unavailable.");
  if (!twelveMonth) messages.push("12-month rate of change is unavailable.");
  if (stale) messages.push(`Underlying data is stale; oldest input is ${oldestInputDate}.`);

  const scoreWeight = metricWeightTotal(config.metricWeights);
  const enoughEvidence = evidence.availableWeight >= scoreWeight * config.minimumEvidenceWeight;
  const score = enoughEvidence ? clamp(evidence.points / evidence.availableWeight * 100, 0, 100) : null;
  const status: CompositeComponentStatus = stale
    ? "stale"
    : score == null
      ? "insufficient_data"
      : "valid";

  return {
    id: component.id,
    name: component.name,
    description: component.description,
    weight: component.weight,
    direction: component.direction,
    status,
    score: score == null ? null : round(score, 2),
    value: round(point.value, 6),
    numeratorValue: round(point.numerator, 6),
    denominatorValue: point.denominator == null ? null : round(point.denominator, 6),
    weightedContribution: score == null || status !== "valid" ? null : round(score * component.weight / 100, 2),
    trendDirection: evidenceDirection(component, previousPoint ? point.value - previousPoint.value : null),
    sixMonthRoc: sixMonth ? round(point.value / sixMonth.value * 100 - 100, 2) : null,
    twelveMonthRoc: twelveMonth ? round(point.value / twelveMonth.value * 100 - 100, 2) : null,
    movingAverage: movingAverage == null ? null : round(movingAverage, 6),
    movingAverageRelationship: movingAverage == null ? "unavailable" : movingAverageRelationship(point.value, movingAverage),
    movingAverageSlope: movingAverage != null && previousMovingAverage != null ? round(movingAverage / previousMovingAverage * 100 - 100, 4) : null,
    evidenceWeight: round(evidence.availableWeight / scoreWeight, 3),
    evidenceDetail: evidence.detail,
    asOfDate: point.date,
    stale,
    messages,
  };
}

function emptyComponent(component: CompositeComponent, status: CompositeComponentStatus, date: string, messages: string[]): CompositeComponentCalculation {
  return {
    id: component.id,
    name: component.name,
    description: component.description,
    weight: component.weight,
    direction: component.direction,
    status,
    score: null,
    value: null,
    numeratorValue: null,
    denominatorValue: null,
    weightedContribution: null,
    trendDirection: "unknown",
    sixMonthRoc: null,
    twelveMonthRoc: null,
    movingAverage: null,
    movingAverageRelationship: "unavailable",
    movingAverageSlope: null,
    evidenceWeight: 0,
    evidenceDetail: [],
    asOfDate: date,
    stale: false,
    messages,
  };
}

function scoreEvidence(input: {
  point: CompositeSeriesPoint;
  component: CompositeComponent;
  movingAverage: number | null;
  previousMovingAverage: number | null;
  sixMonth: CompositeSeriesPoint | null;
  twelveMonth: CompositeSeriesPoint | null;
}) {
  const { point, component, movingAverage, previousMovingAverage, sixMonth, twelveMonth } = input;
  const weights = component.scoringConfig.metricWeights;
  const detail: CompositeComponentCalculation["evidenceDetail"] = [];
  let points = 0;
  let availableWeight = 0;

  const add = (key: keyof CompositeMetricWeights, label: string, metric: number | null) => {
    const max = weights[key];
    if (metric == null || max <= 0) {
      detail.push({ key, label, points: 0, max, available: false, passed: null });
      return;
    }
    availableWeight += max;
    const directionalMetric = component.direction === "inverse" ? -metric : metric;
    const earned = directionalMetric > FLAT_EPSILON ? max : Math.abs(directionalMetric) <= FLAT_EPSILON ? max / 2 : 0;
    points += earned;
    detail.push({ key, label, points: round(earned, 2), max, available: true, passed: earned > 0 });
  };

  add("priceVsMovingAverage", "Relationship to 200DMA", movingAverage == null ? null : point.value / movingAverage - 1);
  add("movingAverageSlope", "200DMA slope", movingAverage == null || previousMovingAverage == null ? null : movingAverage / previousMovingAverage - 1);
  add("roc6m", "6-month ROC", sixMonth ? point.value / sixMonth.value - 1 : null);
  add("roc12m", "12-month ROC", twelveMonth ? point.value / twelveMonth.value - 1 : null);

  return { points, availableWeight, detail };
}

function valueForBasis(point: RatioHistoryPoint, basis: CompositeSeriesBasis) {
  return basis === "raw_market" ? point.close : point.valueAud;
}

function movingAverageAt(series: CompositeSeriesPoint[], index: number, period: number) {
  if (index < 0 || index + 1 < period) return null;
  const window = series.slice(index + 1 - period, index + 1);
  return window.reduce((sum, point) => sum + point.value, 0) / period;
}

function lookbackPoint(series: CompositeSeriesPoint[], currentDate: string, days: number) {
  const target = dateTime(currentDate) - days * DAY_MS;
  let candidate: CompositeSeriesPoint | null = null;
  for (const point of series) {
    const time = dateTime(point.date);
    if (time <= target) candidate = point;
    else break;
  }
  return candidate;
}

function previousSeriesPoint(series: CompositeSeriesPoint[], index: number) {
  return index > 0 ? series[index - 1] ?? null : null;
}

function scoreChange(points: Array<{ date: string; score: number | null }>, latest: { date: string; score: number }, days: number) {
  const target = dateTime(latest.date) - days * DAY_MS;
  let candidate: { date: string; score: number | null } | null = null;
  for (const point of points) {
    if (point.score == null) continue;
    if (dateTime(point.date) <= target) candidate = point;
    else break;
  }
  return candidate?.score == null ? null : round(latest.score - candidate.score, 2);
}

function movingAverageRelationship(value: number, movingAverage: number): MovingAverageRelationship {
  const difference = value / movingAverage - 1;
  if (Math.abs(difference) <= FLAT_EPSILON) return "at";
  return difference > 0 ? "above" : "below";
}

function evidenceDirection(component: CompositeComponent, change: number | null): CompositeTrendDirection {
  if (change == null || Math.abs(change) <= FLAT_EPSILON) return "flat";
  const evidenceChange = component.direction === "inverse" ? -change : change;
  return evidenceChange > 0 ? "up" : "down";
}

function withinCarryForwardWindow(sourceDate: string, targetDate: string, maxDays: number) {
  return daysBetween(sourceDate, targetDate) <= maxDays;
}

function daysBetween(left: string, right: string) {
  return Math.max(0, Math.round((dateTime(right) - dateTime(left)) / DAY_MS));
}

function dateTime(value: string) {
  return new Date(`${value}T12:00:00Z`).getTime();
}

function metricWeightTotal(weights: CompositeMetricWeights) {
  return weights.priceVsMovingAverage + weights.movingAverageSlope + weights.roc6m + weights.roc12m;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatWeight(value: number) {
  return value.toLocaleString("en-AU", { maximumFractionDigits: 2 });
}
