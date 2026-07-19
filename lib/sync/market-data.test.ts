import assert from "node:assert/strict";
import test from "node:test";
import { syncMarketData } from "./market-data";
import type { DailyPriceInput, FxRateInput, NewSyncRun, PriceBook, PriceImportResult, StorageAdapter, SyncRun } from "@/lib/storage/types";

function syncRun(input: NewSyncRun): SyncRun {
  const finishedAt = input.finishedAt ?? new Date().toISOString();
  return {
    id: `sync-${Math.random()}`,
    source: input.source,
    ownerType: input.ownerType ?? null,
    trigger: input.trigger,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt,
    durationMs: 0,
    recordCount: input.recordCount ?? null,
    positionCount: input.positionCount ?? null,
    cashAud: input.cashAud ?? null,
    message: input.message ?? null,
    error: input.error ?? null,
  };
}

function storageStub(input: {
  priceBook?: PriceBook;
  onPrices?: (prices: DailyPriceInput[], fxRates: FxRateInput[]) => void;
  runs: NewSyncRun[];
}): StorageAdapter {
  return {
    async listPriceBook() {
      return input.priceBook ?? { instruments: [], prices: [], fxRates: [] };
    },
    async recordDailyPrices(prices, fxRates) {
      input.onPrices?.(prices, fxRates ?? []);
      return {
        imported: prices.length,
        matchedInstruments: prices.length,
        updatedPositions: prices.length,
        updatedCashAccounts: 0,
        fxRates: fxRates?.length ?? 0,
        skipped: 0,
        errors: [],
        storageMode: "postgresql",
      } satisfies PriceImportResult;
    },
    async recordSyncRun(run) {
      input.runs.push(run);
      return syncRun(run);
    },
  } as Partial<StorageAdapter> as StorageAdapter;
}

test("syncMarketData records a clean skip when explicit EODHD is not configured", async () => {
  const originalToken = process.env.EODHD_API_TOKEN;
  const originalAltToken = process.env.MARKETDATA_EODHD_API_TOKEN;
  delete process.env.EODHD_API_TOKEN;
  delete process.env.MARKETDATA_EODHD_API_TOKEN;
  const runs: NewSyncRun[] = [];

  try {
    const result = await syncMarketData(storageStub({ runs }), "scheduled", "eodhd");
    assert.equal(result.status, "skipped");
    assert.equal(result.configured, false);
    assert.match(result.message, /EODHD_API_TOKEN/);
    assert.equal(runs[0].source, "Market Data");
    assert.equal(runs[0].status, "skipped");
  } finally {
    if (originalToken == null) delete process.env.EODHD_API_TOKEN;
    else process.env.EODHD_API_TOKEN = originalToken;
    if (originalAltToken == null) delete process.env.MARKETDATA_EODHD_API_TOKEN;
    else process.env.MARKETDATA_EODHD_API_TOKEN = originalAltToken;
  }
});

test("syncMarketData auto refreshes through Yahoo without EODHD", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.EODHD_API_TOKEN;
  const originalAltToken = process.env.MARKETDATA_EODHD_API_TOKEN;
  delete process.env.EODHD_API_TOKEN;
  delete process.env.MARKETDATA_EODHD_API_TOKEN;
  const runs: NewSyncRun[] = [];
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("/CMM.AX?")) {
      return new Response(JSON.stringify({
        chart: {
          result: [{
            meta: { currency: "AUD", exchangeTimezoneName: "Australia/Sydney" },
            timestamp: [Date.parse("2026-07-18T06:00:00Z") / 1000],
            indicators: { quote: [{ close: [10.1] }] },
          }],
          error: null,
        },
      }), { status: 200 });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const result = await syncMarketData(storageStub({
      runs,
      priceBook: {
        instruments: [{
          symbol: "CMM",
          exchange: "ASX",
          name: "Capricorn Metals",
          currency: "AUD",
          assetClass: "Gold miners",
          positionCount: 1,
          quantity: 100,
          marketValueAud: 1010,
          lastPrice: 10,
          asOfDate: "2026-07-17",
        }],
        prices: [],
        fxRates: [],
      },
    }), "scheduled", "auto");

    assert.equal(result.status, "success");
    assert.equal(result.configured, true);
    assert.equal(result.quotes, 1);
    assert.equal(runs[0].status, "success");
    assert.ok(requestedUrls.some((url) => url.includes("/CMM.AX?")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken == null) delete process.env.EODHD_API_TOKEN;
    else process.env.EODHD_API_TOKEN = originalToken;
    if (originalAltToken == null) delete process.env.MARKETDATA_EODHD_API_TOKEN;
    else process.env.MARKETDATA_EODHD_API_TOKEN = originalAltToken;
  }
});

test("syncMarketData refreshes quotes and records success when EODHD is configured", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.EODHD_API_TOKEN;
  process.env.EODHD_API_TOKEN = "test-token";
  const runs: NewSyncRun[] = [];
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("/AAPL.US?")) {
      return new Response(JSON.stringify({ close: 100, timestamp: Date.parse("2026-07-18T00:00:00Z") / 1000, gmtoffset: 0 }), { status: 200 });
    }
    if (url.includes("/USDAUD.FOREX?")) {
      return new Response(JSON.stringify({ close: 1.52, timestamp: Date.parse("2026-07-18T00:00:00Z") / 1000, gmtoffset: 0 }), { status: 200 });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const result = await syncMarketData(storageStub({
      runs,
      priceBook: {
        instruments: [{
          symbol: "AAPL",
          exchange: "US",
          name: "Apple",
          currency: "USD",
          assetClass: "Technology",
          positionCount: 1,
          quantity: 10,
          marketValueAud: 1520,
          lastPrice: 100,
          asOfDate: "2026-07-17",
        }],
        prices: [],
        fxRates: [],
      },
      onPrices(prices, fxRates) {
        assert.equal(prices.length, 1);
        assert.equal(prices[0].source, "EODHD delayed quote");
        assert.equal(fxRates.length, 1);
        assert.equal(fxRates[0].source, "EODHD FX");
      },
    }), "scheduled");

    assert.equal(result.status, "success");
    assert.equal(result.quotes, 1);
    assert.equal(result.updatedPositions, 1);
    assert.equal(runs[0].status, "success");
    assert.ok(requestedUrls.some((url) => url.includes("/AAPL.US?")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken == null) delete process.env.EODHD_API_TOKEN;
    else process.env.EODHD_API_TOKEN = originalToken;
  }
});
