import assert from "node:assert/strict";
import test from "node:test";
import type { StoredDailyPrice, StoredFxRate } from "@/lib/storage";
import { applyRatioRange, buildInstrumentHistory, buildRatioSeries, relativeReturnWindows } from "./ratio-engine";

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
