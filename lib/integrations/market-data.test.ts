import assert from "node:assert/strict";
import test from "node:test";
import { fetchFrankfurterFx, refreshMarketQuotes } from "./market-data";
import type { PriceableInstrument } from "@/lib/storage";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function instrument(input: Partial<PriceableInstrument> = {}): PriceableInstrument {
  return {
    symbol: "AAPL",
    exchange: "US",
    name: "Apple",
    currency: "USD",
    assetClass: "Technology",
    positionCount: 1,
    quantity: 10,
    marketValueAud: 9999,
    lastPrice: 100,
    asOfDate: "2026-07-17",
    ...input,
  };
}

test("fetchFrankfurterFx returns an AUD conversion rate", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "https://api.frankfurter.dev/v2/rate/USD/AUD?date=2026-07-18");
    return jsonResponse({ date: "2026-07-18", base: "USD", quote: "AUD", rate: 1.5234 });
  };

  try {
    const rate = await fetchFrankfurterFx("usd", "2026-07-18");
    assert.deepEqual(rate, {
      currency: "USD",
      rateToAud: 1.5234,
      rateDate: "2026-07-18",
      source: "Frankfurter FX",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refreshMarketQuotes falls back to Frankfurter FX before inferred position FX", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.EODHD_API_TOKEN;
  const requestedUrls: string[] = [];
  process.env.EODHD_API_TOKEN = "test-token";
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("/AAPL.US?")) {
      return jsonResponse({ close: 100, timestamp: Date.parse("2026-07-18T00:00:00Z") / 1000, gmtoffset: 0 });
    }
    if (url.includes("/USDAUD.FOREX?")) return jsonResponse({ error: "not entitled" }, 403);
    if (url === "https://api.frankfurter.dev/v2/rate/USD/AUD?date=2026-07-18") {
      return jsonResponse({ date: "2026-07-18", base: "USD", quote: "AUD", rate: 1.51 });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const result = await refreshMarketQuotes([instrument()], "eodhd");
    assert.equal(result.prices.length, 1);
    assert.equal(result.fxRates.length, 1);
    assert.equal(result.fxRates[0].source, "Frankfurter FX");
    assert.equal(result.fxRates[0].rateToAud, 1.51);
    assert.equal(result.providers.eodhdConfigured, true);
    assert.ok(requestedUrls.some((url) => url.includes("/USDAUD.FOREX?")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken == null) delete process.env.EODHD_API_TOKEN;
    else process.env.EODHD_API_TOKEN = originalToken;
  }
});

test("refreshMarketQuotes fetches ASX closes from Yahoo without a token", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.EODHD_API_TOKEN;
  const originalAltToken = process.env.MARKETDATA_EODHD_API_TOKEN;
  delete process.env.EODHD_API_TOKEN;
  delete process.env.MARKETDATA_EODHD_API_TOKEN;
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("/CMM.AX?")) {
      return jsonResponse({
        chart: {
          result: [{
            meta: { currency: "AUD", exchangeTimezoneName: "Australia/Sydney" },
            timestamp: [Date.parse("2026-07-17T06:00:00Z") / 1000, Date.parse("2026-07-18T06:00:00Z") / 1000],
            indicators: { quote: [{ close: [9.85, 10.12] }] },
          }],
          error: null,
        },
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const result = await refreshMarketQuotes([instrument({ symbol: "CMM", exchange: "ASX", currency: "AUD" })], "yahoo");
    assert.equal(result.prices.length, 1);
    assert.equal(result.quotes[0].providerSymbol, "CMM.AX");
    assert.equal(result.quotes[0].close, 10.12);
    assert.equal(result.prices[0].source, "Yahoo Finance delayed chart");
    assert.equal(result.providerConfigured, true);
    assert.ok(requestedUrls.some((url) => url.includes("/CMM.AX?")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken == null) delete process.env.EODHD_API_TOKEN;
    else process.env.EODHD_API_TOKEN = originalToken;
    if (originalAltToken == null) delete process.env.MARKETDATA_EODHD_API_TOKEN;
    else process.env.MARKETDATA_EODHD_API_TOKEN = originalAltToken;
  }
});

test("refreshMarketQuotes falls back from EODHD errors to Yahoo in auto mode", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.EODHD_API_TOKEN;
  process.env.EODHD_API_TOKEN = "test-token";
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("/AAPL.US?")) return jsonResponse({ error: "not entitled" }, 403);
    if (url.includes("/AAPL?")) {
      return jsonResponse({
        chart: {
          result: [{
            meta: { currency: "USD", exchangeTimezoneName: "America/New_York" },
            timestamp: [Date.parse("2026-07-17T20:00:00Z") / 1000],
            indicators: { quote: [{ close: [211.18] }] },
          }],
          error: null,
        },
      });
    }
    if (url.includes("/USDAUD.FOREX?")) return jsonResponse({ close: 1.52, timestamp: Date.parse("2026-07-18T00:00:00Z") / 1000, gmtoffset: 0 });
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const result = await refreshMarketQuotes([instrument()], "auto");
    assert.equal(result.prices.length, 1);
    assert.equal(result.failures.length, 0);
    assert.equal(result.quotes[0].source, "Yahoo Finance delayed chart");
    assert.equal(result.fxRates[0].source, "EODHD FX");
    assert.ok(requestedUrls.some((url) => url.includes("/AAPL.US?")));
    assert.ok(requestedUrls.some((url) => url.includes("/AAPL?")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken == null) delete process.env.EODHD_API_TOKEN;
    else process.env.EODHD_API_TOKEN = originalToken;
  }
});

test("refreshMarketQuotes reports Yahoo rate limits cleanly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Edge: Too Many Requests", {
    status: 429,
    headers: { "content-type": "text/html" },
  });

  try {
    const result = await refreshMarketQuotes([instrument({ symbol: "CMM", exchange: "ASX", currency: "AUD" })], "yahoo");
    assert.equal(result.prices.length, 0);
    assert.match(result.failures[0].message, /rate limited/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refreshMarketQuotes reports missing EODHD token when EODHD is requested", async () => {
  const originalToken = process.env.EODHD_API_TOKEN;
  const originalAltToken = process.env.MARKETDATA_EODHD_API_TOKEN;
  delete process.env.EODHD_API_TOKEN;
  delete process.env.MARKETDATA_EODHD_API_TOKEN;

  try {
    const result = await refreshMarketQuotes([instrument()], "eodhd");
    assert.equal(result.providerConfigured, false);
    assert.equal(result.providers.eodhdConfigured, false);
    assert.equal(result.prices.length, 0);
    assert.match(result.failures[0].message, /EODHD token/);
  } finally {
    if (originalToken == null) delete process.env.EODHD_API_TOKEN;
    else process.env.EODHD_API_TOKEN = originalToken;
    if (originalAltToken == null) delete process.env.MARKETDATA_EODHD_API_TOKEN;
    else process.env.MARKETDATA_EODHD_API_TOKEN = originalAltToken;
  }
});

test("refreshMarketQuotes surfaces Stooq browser verification pages", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<!doctype html><noscript>This site requires JavaScript to verify your browser.</noscript><script>fetch('/__verify')</script>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });

  try {
    const result = await refreshMarketQuotes([instrument()], "stooq");
    assert.equal(result.prices.length, 0);
    assert.match(result.failures[0].message, /browser verification/);
    assert.equal(result.providers.stooqEnabled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
