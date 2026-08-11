import type { PortfolioScope } from "../types";

export type PerformancePoint = {
  date: string;
  overall?: number;
  personal?: number;
  smsf?: number;
  overallInvested?: number;
  personalInvested?: number;
  smsfInvested?: number;
};

export type ChartValueMode = "shares" | "nav";
export type NavRange = "1m" | "3m" | "6m" | "1y" | "itd";

export const NAV_RANGES: Array<{ id: NavRange; label: string; days: number | null }> = [
  { id: "1m", label: "1M", days: 31 },
  { id: "3m", label: "3M", days: 92 },
  { id: "6m", label: "6M", days: 183 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "itd", label: "ITD", days: null },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function sumDefined(left: number | undefined, right: number | undefined) {
  if (left === undefined && right === undefined) return undefined;
  return (left ?? 0) + (right ?? 0);
}

/** NAV for a scope: invested market value plus cash. */
export function navForScope(point: PerformancePoint, scope: PortfolioScope) {
  if (scope === "personal") return point.personal;
  if (scope === "smsf") return point.smsf;
  return point.overall ?? sumDefined(point.personal, point.smsf);
}

/** Invested market value for a scope, excluding cash. */
export function investedForScope(point: PerformancePoint, scope: PortfolioScope) {
  if (scope === "personal") return point.personalInvested ?? point.personal;
  if (scope === "smsf") return point.smsfInvested ?? point.smsf;
  return point.overallInvested ?? sumDefined(point.personalInvested, point.smsfInvested) ?? navForScope(point, scope);
}

export function valueForScope(point: PerformancePoint, scope: PortfolioScope, mode: ChartValueMode) {
  return mode === "shares" ? investedForScope(point, scope) : navForScope(point, scope);
}

export type NavSeriesPoint = {
  date: string;
  time: number;
  /** The charted value — NAV or invested, depending on mode. */
  value: number;
  nav: number;
  invested: number;
  cash: number;
  personal: number | undefined;
  smsf: number | undefined;
};

export type NavSeriesStats = {
  peak: number;
  peakDate: string;
  floor: number;
  floorDate: string;
  bestDayPercent: number;
  worstDayPercent: number;
};

function toPoint(point: PerformancePoint, scope: PortfolioScope, mode: ChartValueMode): NavSeriesPoint | null {
  const nav = navForScope(point, scope);
  const value = valueForScope(point, scope, mode);
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const invested = investedForScope(point, scope) ?? nav ?? value;
  const time = new Date(`${point.date}T12:00:00Z`).getTime();
  if (!Number.isFinite(time)) return null;
  const resolvedNav = typeof nav === "number" && Number.isFinite(nav) ? nav : value;
  return {
    date: point.date,
    time,
    value,
    nav: resolvedNav,
    invested,
    // Snapshots record invested and cash separately, so cash is the residual. Clamped because a
    // scope with no cash account can round to a hair below zero.
    cash: Math.max(0, resolvedNav - invested),
    personal: mode === "shares" ? point.personalInvested ?? point.personal : point.personal,
    smsf: mode === "shares" ? point.smsfInvested ?? point.smsf : point.smsf,
  };
}

export function filterByRange(points: NavSeriesPoint[], range: NavRange): NavSeriesPoint[] {
  const days = NAV_RANGES.find((item) => item.id === range)?.days ?? null;
  if (days == null || points.length < 2) return points;
  const latest = points[points.length - 1];
  const filtered = points.filter((point) => point.time >= latest.time - days * DAY_MS);
  // A short range that captures fewer than two snapshots cannot be drawn; fall back to everything
  // rather than rendering a single point as a flat line.
  return filtered.length >= 2 ? filtered : points;
}

export function buildNavSeries(input: {
  performance: PerformancePoint[];
  scope: PortfolioScope;
  mode: ChartValueMode;
  range: NavRange;
}): NavSeriesPoint[] {
  const all = input.performance
    .map((point) => toPoint(point, input.scope, input.mode))
    .filter((point): point is NavSeriesPoint => point !== null)
    .sort((left, right) => left.time - right.time);
  return filterByRange(all, input.range);
}

export function navSeriesStats(points: NavSeriesPoint[]): NavSeriesStats | null {
  if (!points.length) return null;
  let peak = points[0];
  let floor = points[0];
  let bestDayPercent = 0;
  let worstDayPercent = 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point.value > peak.value) peak = point;
    if (point.value < floor.value) floor = point;
    if (index === 0) continue;
    const previous = points[index - 1].value;
    if (!previous) continue;
    const change = ((point.value - previous) / previous) * 100;
    if (change > bestDayPercent) bestDayPercent = change;
    if (change < worstDayPercent) worstDayPercent = change;
  }

  return {
    peak: peak.value,
    peakDate: peak.date,
    floor: floor.value,
    floorDate: floor.date,
    bestDayPercent,
    worstDayPercent,
  };
}

/** Highest value seen up to and including `index` — the reference for drawdown. */
export function runningPeak(points: NavSeriesPoint[], index: number) {
  let peak = 0;
  for (let cursor = 0; cursor <= index && cursor < points.length; cursor += 1) {
    if (points[cursor].value > peak) peak = points[cursor].value;
  }
  return peak;
}
