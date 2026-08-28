import assert from "node:assert/strict";
import test from "node:test";
import type { StoredDailyPrice, StoredFxRate } from "@/lib/storage";
import { applyRatioRange, buildInstrumentHistory, buildRatioSeries, latestRatioTrendState, MAX_RATIO_CARRY_FORWARD_DAYS, ratioMovingAverageSeries, RELATIVE_COVERAGE_FLOOR, relativeReturnWindows, relativeStrengthScore, scoreRatioTrend, scoreRatioTrendVelocity } from "./ratio-engine";

function closeTo(actual: number | null | undefined, expected: number, delta = 0.000001) {
  assert.ok(actual != null && Math.abs(actual - expected) <= delta, `expected ${actual} to be within ${delta} of ${expected}`);
}

function price(symbol: string, exchange: string, currency: string, close: number, priceDate: string): StoredDailyPrice {
  return {
    id: `${symbol}-${priceDate}`,
    instrumentId: `${symbol}:${exchange}`,
    symbol,
    exchange,
    name: symbol,
    currency,
    close,
    priceDate,
    source: "test",
    retrievedAt: `${priceDate}T01:00:00.000Z`,
  };
}

function fx(currency: string, rateToAud: number, rateDate: string): StoredFxRate {
  return { id: `${currency}-${rateDate}`, currency, rateToAud, rateDate, source: "test", retrievedAt: `${rateDate}T01:00:00.000Z` };
}

test("buildInstrumentHistory converts foreign closes to AUD using date-effective FX", () => {
  const history = buildInstrumentHistory(
    [price("XLE", "NYSE", "USD", 60, "2026-08-01"), price("XLE", "NYSE", "USD", 60, "2026-08-02")],
    [fx("USD", 1.5, "2026-08-01"), fx("USD", 1.6, "2026-08-02")],
    { symbol: "XLE", exchange: "US", currency: "USD" },
  );
  assert.deepEqual(history.map((point) => point.valueAud), [90, 96]);
});

test("buildRatioSeries captures FX-only relative moves on unchanged local prices", () => {
  const left = buildInstrumentHistory(
    [price("XLE", "NYSE", "USD", 60, "2026-08-01"), price("XLE", "NYSE", "USD", 60, "2026-08-02")],
    [fx("USD", 1.5, "2026-08-01"), fx("USD", 1.6, "2026-08-02")],
    { symbol: "XLE", exchange: "NYSE", currency: "USD" },
  );
  const right = buildInstrumentHistory(
    [price("GOLD", "TVC", "USD", 3000, "2026-08-01"), price("GOLD", "TVC", "USD", 3000, "2026-08-02")],
    [fx("USD", 1.5, "2026-08-01"), fx("USD", 1.6, "2026-08-02")],
    { symbol: "GOLD", exchange: "TVC", currency: "USD" },
  );
  const series = buildRatioSeries(left, right);
  closeTo(series.at(-1)?.leftIndexed, 106.6666666667);
  closeTo(series.at(-1)?.rightIndexed, 106.6666666667);
  closeTo(series.at(-1)?.ratio, 2);
});

test("buildRatioSeries captures price-only relative moves", () => {
  const rates = [fx("USD", 1.5, "2026-08-01")];
  const left = buildInstrumentHistory(
    [price("XLE", "NYSE", "USD", 60, "2026-08-01"), price("XLE", "NYSE", "USD", 66, "2026-08-02")],
    rates,
    { symbol: "XLE", exchange: "NYSE", currency: "USD" },
  );
  const right = buildInstrumentHistory(
    [price("GOLD", "TVC", "USD", 3000, "2026-08-01"), price("GOLD", "TVC", "USD", 3000, "2026-08-02")],
    rates,
    { symbol: "GOLD", exchange: "TVC", currency: "USD" },
  );
  const series = buildRatioSeries(left, right);
  closeTo(series.at(-1)?.leftIndexed, 110);
  closeTo(series.at(-1)?.rightIndexed, 100);
  closeTo(series.at(-1)?.ratio, 2.2);
});

test("buildRatioSeries decomposes raw relative moves and FX contribution", () => {
  const left = buildInstrumentHistory(
    [price("LEU", "NYSE", "USD", 100, "2026-08-01"), price("LEU", "NYSE", "USD", 124.6, "2026-08-02")],
    [fx("USD", 1.55, "2026-08-01"), fx("USD", 1.4728731942215088, "2026-08-02")],
    { symbol: "LEU", exchange: "NYSE", currency: "USD" },
  );
  const right = buildInstrumentHistory(
    [price("SLX", "ASX", "AUD", 10, "2026-08-01"), price("SLX", "ASX", "AUD", 10, "2026-08-02")],
    [],
    { symbol: "SLX", exchange: "ASX", currency: "AUD" },
  );
  const series = buildRatioSeries(left, right);
  const window = relativeReturnWindows(series).find((item) => item.key === "all")!;

  closeTo(window.rawRatioReturnPercent, 24.6);
  closeTo(window.ratioReturnPercent, 18.4);
  closeTo(window.fxContributionPercent, -6.2);
  closeTo(window.fxRatioReturnPercent, -4.9759229535);
});

test("buildRatioSeries leaves raw and normalised returns identical for same-currency pairs", () => {
  const left = buildInstrumentHistory(
    [price("DYL", "ASX", "AUD", 10, "2026-08-01"), price("DYL", "ASX", "AUD", 12, "2026-08-02")],
    [],
    { symbol: "DYL", exchange: "ASX", currency: "AUD" },
  );
  const right = buildInstrumentHistory(
    [price("PDN", "ASX", "AUD", 10, "2026-08-01"), price("PDN", "ASX", "AUD", 11, "2026-08-02")],
    [],
    { symbol: "PDN", exchange: "ASX", currency: "AUD" },
  );
  const window = relativeReturnWindows(buildRatioSeries(left, right)).find((item) => item.key === "all")!;

  closeTo(window.rawRatioReturnPercent, 9.0909090909);
  closeTo(window.ratioReturnPercent, 9.0909090909);
  closeTo(window.fxContributionPercent, 0);
});

test("buildRatioSeries carries forward latest known closes for mismatched market dates", () => {
  const left = buildInstrumentHistory(
    [price("PDN", "ASX", "AUD", 10, "2026-08-01"), price("PDN", "ASX", "AUD", 12, "2026-08-03")],
    [],
    { symbol: "PDN", exchange: "ASX", currency: "AUD" },
  );
  const right = buildInstrumentHistory(
    [price("URNM", "AMEX", "USD", 50, "2026-08-02")],
    [fx("USD", 1.5, "2026-08-01")],
    { symbol: "URNM", exchange: "AMEX", currency: "USD" },
  );
  const series = buildRatioSeries(left, right);
  assert.deepEqual(series.map((point) => point.date), ["2026-08-02", "2026-08-03"]);
  assert.equal(series[0].left, 10);
  assert.equal(series[1].left, 12);
  assert.equal(series[1].right, 50);
});

test("buildRatioSeries stops carrying a stale leg after the alignment window", () => {
  const left = buildInstrumentHistory(
    [price("PDN", "ASX", "AUD", 10, "2026-08-03"), price("PDN", "ASX", "AUD", 12, "2026-08-07")],
    [],
    { symbol: "PDN", exchange: "ASX", currency: "AUD" },
  );
  const right = buildInstrumentHistory(
    [price("URA", "AMEX", "USD", 50, "2026-08-03")],
    [fx("USD", 1.5, "2026-08-03")],
    { symbol: "URA", exchange: "AMEX", currency: "USD" },
  );
  const series = buildRatioSeries(left, right);

  assert.equal(MAX_RATIO_CARRY_FORWARD_DAYS, 3);
  assert.deepEqual(series.map((point) => point.date), ["2026-08-03"]);
});

test("applyRatioRange and relativeReturnWindows calculate period returns", () => {
  const left = buildInstrumentHistory(
    [price("SLVM", "ASX", "AUD", 20, "2026-01-01"), price("SLVM", "ASX", "AUD", 30, "2026-07-01"), price("SLVM", "ASX", "AUD", 36, "2026-08-01")],
    [],
    { symbol: "SLVM", exchange: "ASX", currency: "AUD" },
  );
  const right = buildInstrumentHistory(
    [price("SILVER", "TVC", "USD", 30, "2026-01-01"), price("SILVER", "TVC", "USD", 30, "2026-07-01"), price("SILVER", "TVC", "USD", 36, "2026-08-01")],
    [fx("USD", 1.5, "2026-01-01")],
    { symbol: "SILVER", exchange: "TVC", currency: "USD" },
  );
  const series = buildRatioSeries(left, right);
  assert.equal(applyRatioRange(series, "1m").length, 2);
  const windows = relativeReturnWindows(series);
  closeTo(windows.find((window) => window.key === "all")?.ratioReturnPercent, 50);
  closeTo(windows.find((window) => window.key === "5y")?.ratioReturnPercent, 50);
  closeTo(windows.find((window) => window.key === "3y")?.ratioReturnPercent, 50);
  closeTo(windows.find((window) => window.key === "1m")?.ratioReturnPercent, 0);
});

test("current position closes are included as the latest point", () => {
  const history = buildInstrumentHistory(
    [price("AYA", "TSX", "CAD", 20, "2026-08-01")],
    [fx("CAD", 1.1, "2026-08-01")],
    { symbol: "AYA", exchange: "CA", currency: "CAD", currentClose: 22, currentDate: "2026-08-03", currentSource: "position" },
  );
  assert.deepEqual(history.map((point) => point.date), ["2026-08-01", "2026-08-03"]);
  assert.equal(history.at(-1)?.valueAud, 24.200000000000003);
});


test("buildInstrumentHistory can use stored FX rates as a currency benchmark", () => {
  const history = buildInstrumentHistory(
    [],
    [fx("USD", 1.5, "2026-08-01"), fx("USD", 1.6, "2026-08-02")],
    { symbol: "USD", exchange: "FX_IDC", currency: "USD" },
  );
  assert.deepEqual(history.map((point) => point.valueAud), [1.5, 1.6]);
  assert.deepEqual(history.map((point) => point.close), [1, 1]);
});

test("relativeStrengthScore weights recent ratio leadership", () => {
  const score = relativeStrengthScore([
    returnWindow({ key: "1m", label: "1M", days: 31, startDate: "2026-07-01", endDate: "2026-08-01", ratioReturnPercent: 20, leftReturnPercent: 30, rightReturnPercent: 8, points: 20 }),
    returnWindow({ key: "3m", label: "3M", days: 92, startDate: "2026-05-01", endDate: "2026-08-01", ratioReturnPercent: 10, leftReturnPercent: 18, rightReturnPercent: 7, points: 60 }),
    returnWindow({ key: "6m", label: "6M", days: 183, startDate: "2026-02-01", endDate: "2026-08-01", ratioReturnPercent: 0, leftReturnPercent: 5, rightReturnPercent: 5, points: 120 }),
    returnWindow({ key: "12m", label: "12M", days: 366, startDate: "2025-08-01", endDate: "2026-08-01", ratioReturnPercent: -10, leftReturnPercent: 0, rightReturnPercent: 11, points: 240 }),
  ]);

  closeTo(score, 60.625);
  assert.equal(relativeStrengthScore([returnWindow({ key: "1m", label: "1M", days: 31, startDate: null, endDate: null, ratioReturnPercent: null, leftReturnPercent: null, rightReturnPercent: null, points: 0 })]), null);
});

test("ratioMovingAverageSeries supports SMA and EMA on the selected basis", () => {
  const series = ratioSeries([100, 110, 130, 160]);
  const sma = ratioMovingAverageSeries(series, { type: "sma", period: 3 });
  const ema = ratioMovingAverageSeries(series, { type: "ema", period: 3 });

  assert.deepEqual(sma.map((point) => point.movingAverage), [null, null, 113.33333333333333, 133.33333333333334]);
  closeTo(ema[2].movingAverage, 113.33333333333333);
  closeTo(ema[3].movingAverage, 136.66666666666666);
  assert.equal(latestRatioTrendState(series, { type: "sma", period: 3 }), "strengthening");
});

function returnWindow(input: {
  key: "all" | "5y" | "3y" | "12m" | "6m" | "3m" | "1m";
  label: string;
  days: number | null;
  startDate: string | null;
  endDate: string | null;
  ratioReturnPercent: number | null;
  leftReturnPercent: number | null;
  rightReturnPercent: number | null;
  points: number;
}) {
  return {
    ...input,
    rawRatioReturnPercent: input.ratioReturnPercent,
    fxRatioReturnPercent: 0,
    fxContributionPercent: 0,
    leftLocalReturnPercent: input.leftReturnPercent,
    rightLocalReturnPercent: input.rightReturnPercent,
  };
}

function ratioSeries(values: number[]) {
  return values.map((ratio, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    left: ratio,
    right: 1,
    leftFxToAud: 1,
    rightFxToAud: 1,
    leftAud: ratio,
    rightAud: 1,
    leftIndexed: ratio,
    rightIndexed: 100,
    leftRawIndexed: ratio,
    rightRawIndexed: 100,
    rawRatio: ratio,
    fxRatio: 1,
    ratio,
  }));
}

test("scoreRatioTrend rewards trend, persistence and breakout transparently", () => {
  const series = ratioSeries(Array.from({ length: 240 }, (_, index) => 100 + index * 0.5));
  const score = scoreRatioTrend(series, 50);

  assert.ok(score.score != null);
  assert.equal(Math.round(score.score!), 50);
  assert.equal(score.coverage, 1);
  assert.deepEqual(score.checks.map((check) => check.passed), [true, true, true, true, true]);
  assert.equal(score.checks[0].max, 20);
  assert.match(score.checks[0].detail, /200D/);
});

test("scoreRatioTrend reports null rather than a low score when the trend checks cannot run", () => {
  // A ratio in a clean uptrend, but with too little stored history for the moving averages.
  const series = ratioSeries(Array.from({ length: 60 }, (_, index) => 100 + index * 0.5));
  const score = scoreRatioTrend(series, 50);

  assert.equal(score.score, null, "absence of history must not read as relative weakness");
  assert.ok(score.rawScore > 0, "the checks that could run did pass");
  assert.ok(score.coverage < RELATIVE_COVERAGE_FLOOR);
  assert.deepEqual(score.checks.filter((check) => !check.available).map((check) => check.key), ["long_trend", "medium_trend"]);
});

test("scoreRatioTrendVelocity stays null when either end lacks coverage", () => {
  const series = ratioSeries(Array.from({ length: 60 }, (_, index) => 100 + index * 0.5));
  assert.equal(scoreRatioTrendVelocity(series, 50), null);
});

test("scoreRatioTrendVelocity compares the current score with 30 days ago", () => {
  const series = ratioSeries([
    ...Array.from({ length: 170 }, (_, index) => 120 - index * 0.25),
    ...Array.from({ length: 70 }, (_, index) => 78 + index * 0.9),
  ]);

  const velocity = scoreRatioTrendVelocity(series, 50);
  assert.ok(velocity != null);
  assert.ok(velocity >= 0, "improving relative trend should not have negative velocity");
});
