import type { RatioHistoryPoint } from "./ratio-engine";

export type EntryScoreCheck = {
  key: "distance_200dma" | "rsi_reset" | "momentum_macd" | "support_retest" | "breakout_retest" | "relative_integrity";
  label: string;
  points: number;
  max: number;
  available: boolean;
  passed: boolean;
  detail: string;
};

export type EntryScoreResult = {
  score: number | null;
  max: number;
  checks: EntryScoreCheck[];
  integrityGateApplied: boolean;
  label: string;
  note: string;
};

export function scoreEntryCondition(history: RatioHistoryPoint[], options: { relativeIntegrityHealthy: boolean | null } = { relativeIntegrityHealthy: null }): EntryScoreResult {
  const points = normaliseHistory(history);
  if (points.length < 20) {
    return {
      score: null,
      max: 100,
      checks: [],
      integrityGateApplied: false,
      label: "Not enough history",
      note: "Entry Score needs stored closes before it can judge price condition.",
    };
  }
  const checks: EntryScoreCheck[] = [
    distanceFromLongAverage(points),
    rsiReset(points),
    macdMomentum(points),
    supportRetest(points),
    breakoutRetest(points),
  ];
  const raw = checks.reduce((sum, check) => sum + check.points, 0);
  const gate = relativeIntegrityGate(points, options.relativeIntegrityHealthy);
  checks.push(gate);
  const gated = gate.passed ? raw : Math.min(raw, 45);
  const score = Math.round(Math.min(100, Math.max(0, gated)));
  return {
    score,
    max: 100,
    checks,
    integrityGateApplied: !gate.passed,
    label: score >= 75 ? "Attractive" : score >= 55 ? "Constructive" : score >= 40 ? "Mixed" : "Poor entry",
    note: gate.passed
      ? "Technical entry condition is scored separately from relative leadership."
      : "Pullback is not treated as a better entry because relative structure is not healthy.",
  };
}

function normaliseHistory(history: RatioHistoryPoint[]) {
  const byDate = new Map<string, RatioHistoryPoint>();
  for (const row of history) {
    if (Number.isFinite(row.close) && row.close > 0) byDate.set(row.date, row);
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function distanceFromLongAverage(points: RatioHistoryPoint[]): EntryScoreCheck {
  const max = 20;
  const latest = points.at(-1)!;
  const ma = average(points.slice(-Math.min(200, points.length)).map((point) => point.close));
  const extension = ma ? (latest.close / ma - 1) * 100 : null;
  const available = extension != null && points.length >= 80;
  let score = 0;
  if (available) {
    if (extension! >= -5 && extension! <= 10) score = 20;
    else if (extension! > 10 && extension! <= 20) score = 14;
    else if (extension! < -5 && extension! >= -20) score = 12;
    else if (extension! > 20 && extension! <= 35) score = 8;
    else score = 4;
  }
  return {
    key: "distance_200dma",
    label: "Distance from 200DMA",
    max,
    points: score,
    available,
    passed: available && score >= 14,
    detail: available ? signed(extension!) + "% from long average" : "needs roughly 80 stored closes",
  };
}

function rsiReset(points: RatioHistoryPoint[]): EntryScoreCheck {
  const max = 20;
  const value = rsi(points.map((point) => point.close), 14);
  const available = value != null;
  let score = 0;
  if (available) {
    if (value! >= 45 && value! <= 60) score = 20;
    else if (value! >= 35 && value! < 45) score = 16;
    else if (value! > 60 && value! <= 70) score = 12;
    else if (value! >= 30 && value! < 35) score = 10;
    else if (value! < 30) score = 6;
    else score = 4;
  }
  return {
    key: "rsi_reset",
    label: "RSI / reset",
    max,
    points: score,
    available,
    passed: available && score >= 12,
    detail: available ? "RSI " + value!.toFixed(1) : "needs RSI history",
  };
}

function macdMomentum(points: RatioHistoryPoint[]): EntryScoreCheck {
  const max = 15;
  const closes = points.map((point) => point.close);
  const macd = macdSeries(closes);
  const latest = macd.at(-1);
  const prior = macd.at(-4) ?? macd.at(-2);
  const available = Boolean(latest && prior);
  const histRising = available && latest!.histogram > prior!.histogram;
  const positiveCross = available && latest!.macd > latest!.signal;
  const score = !available ? 0 : positiveCross && histRising ? 15 : histRising ? 10 : positiveCross ? 7 : 0;
  return {
    key: "momentum_macd",
    label: "Momentum / MACD",
    max,
    points: score,
    available,
    passed: available && score >= 10,
    detail: available ? (positiveCross ? "MACD above signal" : "MACD below signal") + (histRising ? "; histogram rising" : "; histogram not rising") : "needs MACD history",
  };
}

function supportRetest(points: RatioHistoryPoint[]): EntryScoreCheck {
  const max = 25;
  const latest = points.at(-1)!;
  const lookback = points.slice(-Math.min(80, points.length));
  const support = Math.min(...lookback.slice(0, -1).map((point) => point.close));
  const distance = support > 0 ? (latest.close / support - 1) * 100 : null;
  const available = distance != null && lookback.length >= 20;
  let score = 0;
  if (available) {
    if (distance! >= 0 && distance! <= 8) score = 25;
    else if (distance! > 8 && distance! <= 15) score = 17;
    else if (distance! > 15 && distance! <= 25) score = 10;
    else if (distance! < 0 && distance! >= -5) score = 8;
    else score = 3;
  }
  return {
    key: "support_retest",
    label: "Support / retest",
    max,
    points: score,
    available,
    passed: available && score >= 17,
    detail: available ? signed(distance!) + "% from recent support" : "needs recent support history",
  };
}

function breakoutRetest(points: RatioHistoryPoint[]): EntryScoreCheck {
  const max = 20;
  const latest = points.at(-1)!;
  const prior = points.slice(Math.max(0, points.length - 140), Math.max(0, points.length - 20));
  const priorHigh = prior.length ? Math.max(...prior.map((point) => point.close)) : null;
  const distance = priorHigh ? (latest.close / priorHigh - 1) * 100 : null;
  const available = distance != null && prior.length >= 20;
  let score = 0;
  if (available) {
    if (distance! >= 0 && distance! <= 10) score = 20;
    else if (distance! < 0 && distance! >= -5) score = 16;
    else if (distance! > 10 && distance! <= 20) score = 12;
    else if (distance! < -5 && distance! >= -15) score = 8;
    else score = 4;
  }
  return {
    key: "breakout_retest",
    label: "Breakout / retest state",
    max,
    points: score,
    available,
    passed: available && score >= 16,
    detail: available ? signed(distance!) + "% from prior high" : "needs prior high history",
  };
}

function relativeIntegrityGate(points: RatioHistoryPoint[], relativeIntegrityHealthy: boolean | null): EntryScoreCheck {
  const latest = points.at(-1)!;
  const comparison = points.at(-21) ?? points[0];
  const pullback = comparison ? (latest.close / comparison.close - 1) * 100 : 0;
  const gateNeeded = pullback <= -8;
  const available = relativeIntegrityHealthy != null;
  const passed = !gateNeeded || relativeIntegrityHealthy !== false;
  return {
    key: "relative_integrity",
    label: "Relative integrity gate",
    max: 0,
    points: 0,
    available,
    passed,
    detail: !gateNeeded
      ? "no major pullback requiring ratio confirmation"
      : !available
        ? "pullback detected; relative health unavailable"
        : relativeIntegrityHealthy
          ? "pullback accepted because relative structure is healthy"
          : "pullback rejected because relative structure is weakening",
  };
}

function rsi(values: number[], period: number) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

function macdSeries(values: number[]) {
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const macd = values.map((_, index) => ema12[index] - ema26[index]);
  const signal = ema(macd, 9);
  return macd.map((value, index) => ({ macd: value, signal: signal[index], histogram: value - signal[index] }));
}

function ema(values: number[], period: number) {
  const multiplier = 2 / (period + 1);
  const output: number[] = [];
  values.forEach((value, index) => {
    output[index] = index === 0 ? value : value * multiplier + output[index - 1] * (1 - multiplier);
  });
  return output;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function signed(value: number) {
  return (value >= 0 ? "+" : "") + value.toLocaleString("en-AU", { maximumFractionDigits: 1 });
}
