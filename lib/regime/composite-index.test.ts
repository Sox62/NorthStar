import assert from "node:assert/strict";
import test from "node:test";
import type { StoredDailyPrice, StoredFxRate } from "@/lib/storage";
import { calculateCompositeIndex, type CompositeIndexDefinition } from "./composite-index";

const scoring = {
  basis: "raw_market" as const,
  movingAverageDays: 200,
  slopeLookbackDays: 20,
  roc6mDays: 183,
  roc12mDays: 366,
  metricWeights: {
    priceVsMovingAverage: 30,
    movingAverageSlope: 25,
    roc6m: 25,
    roc12m: 20,
  },
  minimumEvidenceWeight: 0.75,
  maxCarryForwardDays: 3,
  staleAfterDays: 5,
};

function definition(weight = 50): CompositeIndexDefinition {
  return {
    id: "test-index",
    name: "Test Index",
    description: "Composite engine test",
    calculationVersion: "test-v1",
    missingDataPolicy: { mode: "require_all", minimumAvailableWeight: 100 },
    thresholds: [
      { id: "LOW", label: "Low", min: 0, max: 50 },
      { id: "HIGH", label: "High", min: 50, max: 100 },
    ],
    components: [
      {
        id: "asset-benchmark",
        name: "Asset / Benchmark",
        description: "Positive leadership",
        numerator: { symbol: "AAA", exchange: "TEST", name: "AAA", currency: "USD" },
        denominator: { symbol: "BBB", exchange: "TEST", name: "BBB", currency: "USD" },
        weight,
        direction: "positive",
        scoringConfig: scoring,
      },
      {
        id: "breadth-deterioration",
        name: "Breadth deterioration",
        description: "Inverse evidence",
        numerator: { symbol: "CCC", exchange: "TEST", name: "CCC", currency: "USD" },
        denominator: { symbol: "DDD", exchange: "TEST", name: "DDD", currency: "USD" },
        weight: 100 - weight,
        direction: "inverse",
        scoringConfig: scoring,
      },
    ],
  };
}

function price(symbol: string, close: number, priceDate: string): StoredDailyPrice {
  return {
    id: `${symbol}-${priceDate}`,
    instrumentId: `${symbol}:TEST`,
    symbol,
    exchange: "TEST",
    name: symbol,
    currency: "USD",
    close,
    priceDate,
    source: "test",
    retrievedAt: `${priceDate}T00:00:00.000Z`,
  };
}

function fx(priceDate: string): StoredFxRate {
  return { id: `usd-${priceDate}`, currency: "USD", rateToAud: 1.5, rateDate: priceDate, source: "test", retrievedAt: `${priceDate}T00:00:00.000Z` };
}

function dateAt(index: number) {
  const date = new Date(Date.UTC(2025, 0, 1 + index, 12));
  return date.toISOString().slice(0, 10);
}

function trendingBook(days = 430) {
  const prices: StoredDailyPrice[] = [];
  const fxRates: StoredFxRate[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = dateAt(index);
    prices.push(
      price("AAA", 100 + index * 0.8, date),
      price("BBB", 100, date),
      price("CCC", 120 - index * 0.12, date),
      price("DDD", 100, date),
    );
    fxRates.push(fx(date));
  }
  return { prices, fxRates };
}

test("composite engine scores positive and inverse leadership from transparent trend inputs", () => {
  const results = calculateCompositeIndex(definition(), trendingBook());
  const latest = results.at(-1);

  assert.equal(latest?.status, "valid");
  assert.ok((latest?.score ?? 0) > 90);
  assert.equal(latest?.regimeId, "HIGH");
  assert.equal(latest?.components.every((component) => component.status === "valid"), true);
});

test("raw-market scoring does not require FX history", () => {
  const book = trendingBook();
  book.fxRates = [];
  const latest = calculateCompositeIndex(definition(), book).at(-1);

  assert.equal(latest?.status, "valid");
  assert.ok((latest?.score ?? 0) > 90);
});

test("composite engine refuses a normal score when required component data is missing", () => {
  const book = trendingBook();
  book.prices = book.prices.filter((row) => row.symbol !== "DDD");
  const latest = calculateCompositeIndex(definition(), book).at(-1);

  assert.equal(latest?.status, "partial");
  assert.equal(latest?.score, null);
  assert.equal(latest?.components.find((component) => component.id === "breadth-deterioration")?.status, "missing");
});

test("composite definition validates that weights total 100", () => {
  const invalid = definition();
  invalid.components[0]!.weight = 70;
  invalid.components[1]!.weight = 20;

  assert.throws(() => calculateCompositeIndex(invalid, trendingBook()), /weights must total 100/);
});
