import type { StoredDailyPrice, StoredFxRate } from "@/lib/storage";

export type RatioRangeKey = "all" | "5y" | "3y" | "12m" | "6m" | "3m" | "1m";

export type RatioInstrument = {
  id?: string;
  symbol: string;
  exchange?: string | null;
  name?: string | null;
  currency: string;
  currentClose?: number | null;
  currentDate?: string | null;
  currentSource?: string | null;
};

export type RatioHistoryPoint = {
  date: string;
  close: number;
  currency: string;
  fxRateToAud: number;
  valueAud: number;
  source: string;
};

export type RatioPoint = {
  date: string;
  left: number;
  right: number;
  leftAud: number;
  rightAud: number;
  leftIndexed: number;
  rightIndexed: number;
  ratio: number;
};

export type RelativeReturnWindow = {
  key: RatioRangeKey;
  label: string;
  days: number | null;
  startDate: string | null;
  endDate: string | null;
  ratioReturnPercent: number | null;
  leftReturnPercent: number | null;
  rightReturnPercent: number | null;
  points: number;
};

export type RelativeScoreCheck = {
  key: "long_trend" | "medium_trend" | "momentum_3m" | "confirmation_6m" | "breakout";
  label: string;
  points: number;
  max: number;
  passed: boolean;
  available: boolean;
  detail: string;
};

export type RelativeScoreComponent = {
  score: number;
  max: number;
  checks: RelativeScoreCheck[];
  availableChecks: number;
};

export const RATIO_RANGES: Array<{ key: RatioRangeKey; label: string; days: number | null }> = [
  { key: "all", label: "All", days: null },
  { key: "5y", label: "5Y", days: 365 * 5 + 2 },
  { key: "3y", label: "3Y", days: 365 * 3 + 1 },
  { key: "12m", label: "12M", days: 366 },
  { key: "6m", label: "6M", days: 183 },
  { key: "3m", label: "3M", days: 92 },
  { key: "1m", label: "1M", days: 31 },
];

export function buildInstrumentHistory(prices: StoredDailyPrice[], fxRates: StoredFxRate[], instrument: RatioInstrument): RatioHistoryPoint[] {
  const currencyHistory = buildCurrencyHistory(fxRates, instrument);
  if (currencyHistory.length) return currencyHistory;
  const byDate = new Map<string, StoredDailyPrice>();
  for (const row of prices) {
    if (!priceMatchesInstrument(row, instrument)) continue;
    const current = byDate.get(row.priceDate);
    if (!current || current.retrievedAt < row.retrievedAt) byDate.set(row.priceDate, row);
  }
  if (instrument.currentClose != null && instrument.currentClose > 0 && instrument.currentDate) {
    const livePoint: StoredDailyPrice = {
      id: `current-${instrument.id ?? instrument.symbol}`,
      instrumentId: null,
      symbol: instrument.symbol,
      exchange: instrument.exchange ?? "",
      name: instrument.name ?? instrument.symbol,
      currency: instrument.currency,
      close: instrument.currentClose,
      priceDate: instrument.currentDate,
      source: instrument.currentSource || "Current position",
      retrievedAt: new Date().toISOString(),
    };
    const current = byDate.get(instrument.currentDate);
    if (!current || current.retrievedAt < livePoint.retrievedAt) byDate.set(instrument.currentDate, livePoint);
  }

  return [...byDate.values()]
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate) || left.retrievedAt.localeCompare(right.retrievedAt))
    .flatMap((row): RatioHistoryPoint[] => {
      const fxRateToAud = fxRateFor(row.currency, row.priceDate, fxRates);
      if (!Number.isFinite(row.close) || row.close <= 0 || fxRateToAud == null || !Number.isFinite(fxRateToAud) || fxRateToAud <= 0) return [];
      return [{
        date: row.priceDate,
        close: row.close,
        currency: normaliseCurrency(row.currency),
        fxRateToAud,
        valueAud: row.close * fxRateToAud,
        source: row.source,
      }];
    });
}

export function buildRatioSeries(leftHistory: RatioHistoryPoint[], rightHistory: RatioHistoryPoint[]): RatioPoint[] {
  const leftByDate = new Map(leftHistory.map((row) => [row.date, row]));
  const rightByDate = new Map(rightHistory.map((row) => [row.date, row]));
  const dates = [...new Set([...leftByDate.keys(), ...rightByDate.keys()])].sort();
  const joined: Array<{ date: string; left: RatioHistoryPoint; right: RatioHistoryPoint }> = [];
  let latestLeft: RatioHistoryPoint | undefined;
  let latestRight: RatioHistoryPoint | undefined;
  for (const date of dates) {
    latestLeft = leftByDate.get(date) ?? latestLeft;
    latestRight = rightByDate.get(date) ?? latestRight;
    if (!latestLeft || !latestRight || !latestRight.valueAud) continue;
    joined.push({ date, left: latestLeft, right: latestRight });
  }
  const first = joined[0];
  if (!first) return [];
  return joined.map((row) => ({
    date: row.date,
    left: row.left.close,
    right: row.right.close,
    leftAud: row.left.valueAud,
    rightAud: row.right.valueAud,
    leftIndexed: first.left.valueAud ? row.left.valueAud / first.left.valueAud * 100 : 100,
    rightIndexed: first.right.valueAud ? row.right.valueAud / first.right.valueAud * 100 : 100,
    ratio: row.right.valueAud ? row.left.valueAud / row.right.valueAud * 100 : 0,
  }));
}

export function applyRatioRange(series: RatioPoint[], range: RatioRangeKey): RatioPoint[] {
  const rangeSpec = RATIO_RANGES.find((item) => item.key === range);
  if (!rangeSpec?.days || series.length < 2) return series;
  const last = series.at(-1);
  if (!last) return series;
  const latest = dateTime(last.date);
  const cutoff = latest - rangeSpec.days * 24 * 60 * 60 * 1000;
  const filtered = series.filter((point) => dateTime(point.date) >= cutoff);
  return filtered.length >= 2 ? filtered : series.slice(-Math.min(series.length, rangeSpec.days));
}

export function relativeReturnWindows(series: RatioPoint[], ranges = RATIO_RANGES): RelativeReturnWindow[] {
  return ranges.map((range) => {
    const windowSeries = applyRatioRange(series, range.key);
    const first = windowSeries[0];
    const last = windowSeries.at(-1);
    return {
      ...range,
      startDate: first?.date ?? null,
      endDate: last?.date ?? null,
      ratioReturnPercent: first && last && first.ratio ? last.ratio / first.ratio * 100 - 100 : null,
      leftReturnPercent: first && last && first.leftAud ? last.leftAud / first.leftAud * 100 - 100 : null,
      rightReturnPercent: first && last && first.rightAud ? last.rightAud / first.rightAud * 100 - 100 : null,
      points: windowSeries.length,
    };
  });
}

export function relativeStrengthScore(windows: RelativeReturnWindow[]) {
  const weights: Partial<Record<RatioRangeKey, number>> = { "1m": 0.35, "3m": 0.3, "6m": 0.2, "12m": 0.15 };
  let weighted = 0;
  let totalWeight = 0;
  for (const window of windows) {
    const weight = weights[window.key] ?? 0;
    if (!weight || window.points < 2 || window.ratioReturnPercent == null) continue;
    // +/-40% relative return spans the full 0-100 score, with 50 reading neutral.
    const score = clamp(50 + window.ratioReturnPercent * 1.25, 0, 100);
    weighted += score * weight;
    totalWeight += weight;
  }
  return totalWeight ? weighted / totalWeight : null;
}

export function scoreRatioTrend(series: RatioPoint[], max = 50): RelativeScoreComponent {
  const scale = max / 50;
  const checks: RelativeScoreCheck[] = [
    trendCheck(series, scale),
    mediumTrendCheck(series, scale),
    momentumCheck(series, "3m", "momentum_3m", "3M", 10 * scale),
    momentumCheck(series, "6m", "confirmation_6m", "6M", 5 * scale),
    breakoutCheck(series, scale),
  ];
  const score = checks.reduce((sum, check) => sum + check.points, 0);
  return { score, max, checks, availableChecks: checks.filter((check) => check.available).length };
}

export function scoreRatioTrendVelocity(series: RatioPoint[], max = 50, days = 30) {
  const latest = series.at(-1);
  if (!latest) return null;
  const cutoff = dateTime(latest.date) - days * 24 * 60 * 60 * 1000;
  const priorSeries = series.filter((point) => dateTime(point.date) <= cutoff);
  if (priorSeries.length < 2) return null;
  return scoreRatioTrend(series, max).score - scoreRatioTrend(priorSeries, max).score;
}

function trendCheck(series: RatioPoint[], scale: number): RelativeScoreCheck {
  const max = 20 * scale;
  const long = movingAverage(series, 200);
  const last = series.at(-1);
  const available = Boolean(last && long != null);
  const passed = available && last!.ratio > long!;
  return {
    key: "long_trend",
    label: "Ratio above 200-day average",
    max,
    points: passed ? max : 0,
    passed,
    available,
    detail: available ? "latest " + formatRatio(last!.ratio) + " vs 200D " + formatRatio(long!) : "needs roughly 200 stored closes",
  };
}

function mediumTrendCheck(series: RatioPoint[], scale: number): RelativeScoreCheck {
  const max = 10 * scale;
  const medium = movingAverage(series, 50);
  const long = movingAverage(series, 200);
  const available = medium != null && long != null;
  const passed = available && medium! > long!;
  return {
    key: "medium_trend",
    label: "50-day average above 200-day",
    max,
    points: passed ? max : 0,
    passed,
    available,
    detail: available ? "50D " + formatRatio(medium!) + " vs 200D " + formatRatio(long!) : "needs roughly 200 stored closes",
  };
}

function momentumCheck(series: RatioPoint[], range: RatioRangeKey, key: RelativeScoreCheck["key"], label: string, max: number): RelativeScoreCheck {
  const window = relativeReturnWindows(series, RATIO_RANGES.filter((item) => item.key === range))[0];
  const available = Boolean(window && window.points >= 2 && window.ratioReturnPercent != null);
  const passed = available && window.ratioReturnPercent! > 0;
  return {
    key,
    label: "Ratio rising over " + label,
    max,
    points: passed ? max : 0,
    passed,
    available,
    detail: available ? formatPercent(window.ratioReturnPercent!) + " relative return" : "needs overlapping stored closes",
  };
}

function breakoutCheck(series: RatioPoint[], scale: number): RelativeScoreCheck {
  const max = 5 * scale;
  const last = series.at(-1);
  const prior = series.slice(Math.max(0, series.length - 253), Math.max(0, series.length - 20));
  const priorHigh = prior.length ? Math.max(...prior.map((point) => point.ratio)) : null;
  const available = Boolean(last && priorHigh != null && Number.isFinite(priorHigh));
  const passed = available && last!.ratio >= priorHigh! * 0.995;
  return {
    key: "breakout",
    label: "Near or above prior relative high",
    max,
    points: passed ? max : 0,
    passed,
    available,
    detail: available ? "latest " + formatRatio(last!.ratio) + " vs prior high " + formatRatio(priorHigh!) : "needs prior relative highs",
  };
}

function movingAverage(series: RatioPoint[], lookback: number) {
  if (series.length < Math.min(lookback, 120)) return null;
  const slice = series.slice(-lookback);
  return slice.reduce((sum, point) => sum + point.ratio, 0) / slice.length;
}

function formatRatio(value: number) {
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function formatPercent(value: number) {
  return (value >= 0 ? "+" : "") + value.toLocaleString("en-AU", { maximumFractionDigits: 1 }) + "%";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildCurrencyHistory(fxRates: StoredFxRate[], instrument: RatioInstrument): RatioHistoryPoint[] {
  const symbol = normaliseSymbol(instrument.symbol);
  const currency = normaliseCurrency(instrument.currency);
  if (symbol !== currency || currency === "AUD") return [];
  return fxRates
    .filter((rate) => normaliseCurrency(rate.currency) === currency && Number.isFinite(rate.rateToAud) && rate.rateToAud > 0)
    .sort((left, right) => left.rateDate.localeCompare(right.rateDate) || left.retrievedAt.localeCompare(right.retrievedAt))
    .map((rate) => ({
      date: rate.rateDate,
      close: 1,
      currency,
      fxRateToAud: rate.rateToAud,
      valueAud: rate.rateToAud,
      source: rate.source,
    }));
}

function priceMatchesInstrument(row: StoredDailyPrice, instrument: RatioInstrument) {
  return normaliseSymbol(row.symbol) === normaliseSymbol(instrument.symbol)
    && (!instrument.exchange || canonicalMarket(row.exchange) === canonicalMarket(instrument.exchange));
}

function fxRateFor(currency: string, date: string, rates: StoredFxRate[]) {
  const normalised = normaliseCurrency(currency);
  if (normalised === "AUD") return 1;
  const rate = rates
    .filter((item) => normaliseCurrency(item.currency) === normalised && item.rateDate <= date)
    .sort((left, right) => right.rateDate.localeCompare(left.rateDate) || right.retrievedAt.localeCompare(left.retrievedAt))[0];
  return rate?.rateToAud ?? null;
}

function canonicalMarket(value: string | null | undefined) {
  const exchange = (value ?? "").trim().toUpperCase();
  if (["CA", "CANADA", "TSX", "TSXV", "TSE", "CVE", "TSX/TSXV"].includes(exchange)) return "CA";
  if (["AU", "ASX", "CHIXAU"].includes(exchange)) return "ASX";
  if (["US", "USA", "NYSE", "NASDAQ", "AMEX", "ARCA", "NYSEARCA"].includes(exchange)) return "US";
  return exchange;
}

function normaliseSymbol(value: string) {
  return value.trim().toUpperCase();
}

function normaliseCurrency(value: string) {
  return value.trim().toUpperCase();
}

function dateTime(value: string) {
  return new Date(`${value}T12:00:00Z`).getTime();
}
