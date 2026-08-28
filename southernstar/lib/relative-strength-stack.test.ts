import assert from "node:assert/strict";
import test from "node:test";
import type { StoredDailyPrice, StoredFxRate } from "@/lib/storage";
import { customBenchmarkNode } from "./selection";
import { buildRelativeStrengthStack, relativeStrengthStackBackfillKeys, resolveRelativeStrengthBenchmarkProfile } from "./relative-strength-stack";

function closeTo(actual: number | null | undefined, expected: number, delta = 0.000001) {
  assert.ok(actual != null && Math.abs(actual - expected) <= delta, `expected ${actual} to be within ${delta} of ${expected}`);
}

function price(symbol: string, exchange: string, currency: string, close: number, priceDate: string): StoredDailyPrice {
  return {
    id: `${symbol}-${exchange}-${priceDate}`,
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

const dyl = {
  id: "holding-dyl",
  symbol: "DYL",
  exchange: "ASX",
  name: "Deep Yellow",
  currency: "AUD",
  assetClass: "Uranium miner",
  lastPrice: null,
  asOfDate: "",
  source: "test",
};

test("resolveRelativeStrengthBenchmarkProfile keeps sector benchmark and sector leader distinct", () => {
  const profile = resolveRelativeStrengthBenchmarkProfile({
    symbol: "SMR",
    name: "NuScale Power nuclear technology",
    exchange: "NYSE",
    currency: "USD",
  });

  assert.equal(profile.marketBenchmark.symbol, "SPY");
  assert.equal(profile.sectorBenchmark?.symbol, "URA");
  assert.equal(profile.leaderBenchmark?.symbol, "CCJ");
  assert.equal(profile.capitalBenchmark.symbol, "GOLD");
});

test("resolveRelativeStrengthBenchmarkProfile treats LEU and SLX as nuclear uranium comparisons", () => {
  for (const symbol of ["LEU", "SLX"]) {
    const profile = resolveRelativeStrengthBenchmarkProfile({ symbol, name: symbol, currency: symbol === "SLX" ? "AUD" : "USD" });
    assert.equal(profile.sectorBenchmark?.symbol, "URA");
    assert.equal(profile.leaderBenchmark?.symbol, "CCJ");
  }
});

test("buildRelativeStrengthStack builds AUD-normalised market, sector, leader and capital ratios", () => {
  const prices = [
    price("DYL", "ASX", "AUD", 10, "2026-08-03"),
    price("DYL", "ASX", "AUD", 12, "2026-08-04"),
    price("SPY", "AMEX", "USD", 500, "2026-08-03"),
    price("SPY", "AMEX", "USD", 500, "2026-08-04"),
    price("URA", "AMEX", "USD", 50, "2026-08-03"),
    price("URA", "AMEX", "USD", 55, "2026-08-04"),
    price("CCJ", "NYSE", "USD", 60, "2026-08-03"),
    price("CCJ", "NYSE", "USD", 66, "2026-08-04"),
    price("GOLD", "TVC", "USD", 3000, "2026-08-03"),
    price("GOLD", "TVC", "USD", 3300, "2026-08-04"),
  ];
  const stack = buildRelativeStrengthStack({
    subject: dyl,
    prices,
    fxRates: [fx("USD", 1.5, "2026-08-03"), fx("USD", 1.6, "2026-08-04")],
    movingAverage: { type: "sma", period: 2 },
  });

  assert.deepEqual(stack.map((item) => item.role), ["market", "sector", "leader", "capital"]);
  assert.deepEqual(stack.map((item) => item.denominator.symbol), ["SPY", "URA", "CCJ", "GOLD"]);
  const sector = stack.find((item) => item.role === "sector")!;
  closeTo(sector.series.at(-1)?.ratio, 12 / (55 * 1.6) * 100);
  closeTo(sector.windows.find((window) => window.key === "all")?.rawRatioReturnPercent, 9.0909090909);
  closeTo(sector.windows.find((window) => window.key === "all")?.ratioReturnPercent, 2.2727272727);
  assert.match(sector.etfWarning ?? "", /Currency-normalised trading prices/);
});

test("COPX/WIRE uses USD to AUD on the US ETF and AUD on the Australian ETF", () => {
  const copx = {
    ...dyl,
    id: "custom-copx",
    symbol: "COPX",
    exchange: "AMEX",
    name: "Global X Copper Miners ETF",
    currency: "USD",
    assetClass: "Copper miners ETF",
  };
  const prices = [
    price("COPX", "AMEX", "USD", 100, "2026-08-03"),
    price("COPX", "AMEX", "USD", 110, "2026-08-04"),
    price("WIRE", "ASX", "AUD", 10, "2026-08-03"),
    price("WIRE", "ASX", "AUD", 11, "2026-08-04"),
  ];
  const wire = customBenchmarkNode("ASX:WIRE")!;
  const stack = buildRelativeStrengthStack({
    subject: copx,
    prices,
    fxRates: [fx("USD", 1.5, "2026-08-03"), fx("USD", 1.6, "2026-08-04")],
    benchmarkNodes: [{ ...wire, role: "sector_etf", label: "WIRE" }],
  });
  const wireRatio = stack.find((item) => item.denominator.symbol === "WIRE");

  assert.equal(wire.basisCurrency, "AUD");
  closeTo(wireRatio?.series.at(-1)?.ratio, (110 * 1.6) / 11 * 100);
  closeTo(wireRatio?.windows.find((window) => window.key === "all")?.rawRatioReturnPercent, 0);
  closeTo(wireRatio?.windows.find((window) => window.key === "all")?.fxContributionPercent, 6.6666666667);
});

test("relativeStrengthStackBackfillKeys includes subject and resolved benchmarks", () => {
  const stack = buildRelativeStrengthStack({
    subject: dyl,
    prices: [],
    fxRates: [],
  });

  assert.deepEqual(relativeStrengthStackBackfillKeys(dyl, stack), ["DYL:ASX", "SPY:AMEX", "URA:AMEX", "CCJ:NYSE", "GOLD:TVC"]);
});
