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

  const instrument: PriceableInstrument = {
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
  };

  try {
    const result = await refreshMarketQuotes([instrument], "eodhd");
    assert.equal(result.prices.length, 1);
    assert.equal(result.fxRates.length, 1);
    assert.equal(result.fxRates[0].source, "Frankfurter FX");
    assert.equal(result.fxRates[0].rateToAud, 1.51);
    assert.ok(requestedUrls.some((url) => url.includes("/USDAUD.FOREX?")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken == null) delete process.env.EODHD_API_TOKEN;
    else process.env.EODHD_API_TOKEN = originalToken;
  }
});
