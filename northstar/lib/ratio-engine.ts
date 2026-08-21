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
