export type SparkPriceRow = {
  symbol: string;
  exchange: string | null;
  close: number;
  priceDate: string;
  currency: string;
  retrievedAt: string;
};

export type SparkInstrument = {
  symbol: string;
  exchange: string;
  name: string;
  currency: string;
};

export type SparkSeries = {
  key: string;
  label: string;
  currency: string;
  /** One value per date on the shared axis, carried forward across gaps. */
  values: number[];
  first: number;
  latest: number;
  changePercent: number;
};

export type SparklineSet = {
  /** The shared date axis every series is aligned to, so one crosshair reads them all. */
  dates: string[];
  series: SparkSeries[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const key = (symbol: string, exchange: string | null | undefined) =>
  `${symbol.trim().toUpperCase()}:${(exchange ?? "").trim().toUpperCase()}`;

/**
 * Markets close on different days, so a naive per-series axis makes a shared crosshair lie. Every
 * series is projected onto one union axis with the last known close carried forward — the same
 * treatment the ratio engine applies for mismatched market dates.
 */
export function buildSparklines(input: {
  prices: SparkPriceRow[];
  instruments: SparkInstrument[];
  days?: number | null;
}): SparklineSet {
  const wanted = new Map(input.instruments.map((instrument) => [key(instrument.symbol, instrument.exchange), instrument]));
  const latestByKeyDate = new Map<string, Map<string, SparkPriceRow>>();

  for (const row of input.prices) {
    const rowKey = key(row.symbol, row.exchange);
    if (!wanted.has(rowKey)) continue;
    if (!(row.close > 0) || !Number.isFinite(row.close)) continue;
    const byDate = latestByKeyDate.get(rowKey) ?? new Map<string, SparkPriceRow>();
    const current = byDate.get(row.priceDate);
    if (!current || current.retrievedAt < row.retrievedAt) byDate.set(row.priceDate, row);
    latestByKeyDate.set(rowKey, byDate);
  }

  const allDates = new Set<string>();
  for (const byDate of latestByKeyDate.values()) for (const date of byDate.keys()) allDates.add(date);
  let dates = [...allDates].sort();

  if (input.days && dates.length) {
    const latest = new Date(`${dates[dates.length - 1]}T12:00:00Z`).getTime();
    const cutoff = latest - input.days * DAY_MS;
    const windowed = dates.filter((date) => new Date(`${date}T12:00:00Z`).getTime() >= cutoff);
    if (windowed.length >= 2) dates = windowed;
  }

  const series: SparkSeries[] = [];
  for (const [seriesKey, instrument] of wanted) {
    const byDate = latestByKeyDate.get(seriesKey);
    if (!byDate) continue;

    const values: number[] = [];
    let carried: number | null = null;
    // Seed from the last close before the window so a series does not start blank.
    for (const date of [...byDate.keys()].sort()) {
      if (date >= dates[0]) break;
      carried = byDate.get(date)?.close ?? carried;
    }
    for (const date of dates) {
      const row = byDate.get(date);
      if (row) carried = row.close;
      if (carried != null) values.push(carried);
      else values.push(Number.NaN);
    }

    const clean = values.filter((value) => Number.isFinite(value));
    if (clean.length < 2) continue;
    const first = clean[0];
    const latest = clean[clean.length - 1];
    series.push({
      key: seriesKey,
      label: instrument.symbol.toUpperCase(),
      currency: instrument.currency,
      values,
      first,
      latest,
      changePercent: first ? ((latest - first) / first) * 100 : 0,
    });
  }

  series.sort((left, right) => right.changePercent - left.changePercent);
  return { dates, series };
}

/** Points for a viewBox of `width` x `height`, with NaN gaps skipped rather than drawn as zero. */
export function sparklinePoints(values: number[], width: number, height: number, padding = 2) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return "";
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = Math.max(max - min, Number.EPSILON);
  const usable = height - padding * 2;

  return values
    .map((value, index) => {
      if (!Number.isFinite(value)) return null;
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = padding + (1 - (value - min) / span) * usable;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
}
