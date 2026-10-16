import assert from "node:assert/strict";
import test from "node:test";
import { tradingViewSavedLayoutUrl, tradingViewSymbolForInstrument } from "./tradingview";

const symbolFor = (symbol: string, exchange: string) => tradingViewSymbolForInstrument({ symbol, exchange });

test("launching the annotated layout preserves its saved chart without a symbol override", () => {
  const original = process.env.NEXT_PUBLIC_TRADINGVIEW_CHART_URL;
  try {
    delete process.env.NEXT_PUBLIC_TRADINGVIEW_CHART_URL;
    assert.equal(tradingViewSavedLayoutUrl(), "https://www.tradingview.com/chart/rps0WMxt/");
    process.env.NEXT_PUBLIC_TRADINGVIEW_CHART_URL = "https://www.tradingview.com/chart/MyDrawingLayout/?symbol=TVC%3AGOLD&interval=D";
    const url = new URL(tradingViewSavedLayoutUrl());
    assert.equal(url.pathname, "/chart/MyDrawingLayout/");
    assert.equal(url.searchParams.get("interval"), "D");
    assert.equal(url.searchParams.has("symbol"), false);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_TRADINGVIEW_CHART_URL;
    else process.env.NEXT_PUBLIC_TRADINGVIEW_CHART_URL = original;
  }
});

test("exchange codes are matched exactly, not by substring", () => {
  // "PHYSICAL" and "NYSEAMERICAN" both contain "CA", which used to route them to TSX.
  assert.equal(symbolFor("PLATINUM", "PHYSICAL"), "ACTIVTRADES:PLATINUM");
  assert.equal(symbolFor("UUUU", "NYSEAMERICAN"), "AMEX:UUUU");
  assert.equal(symbolFor("MAG", "NYSEAMERICAN"), "AMEX:MAG");
});

test("Canadian listings still resolve to TSX and TSXV", () => {
  assert.equal(symbolFor("AYA", "TSX"), "TSX:AYA");
  assert.equal(symbolFor("DML", "TSE"), "TSX:DML");
  assert.equal(symbolFor("WRN", "TSX/TSXV"), "TSX:WRN");
  assert.equal(symbolFor("ABC", "CVE"), "TSXV:ABC");
  assert.equal(symbolFor("ABC", "TSXV"), "TSXV:ABC");
});

test("US venues normalise to the venue TradingView uses", () => {
  assert.equal(symbolFor("CDE", "NYSE"), "NYSE:CDE");
  assert.equal(symbolFor("PAAS", "NASDAQ"), "NASDAQ:PAAS");
  assert.equal(symbolFor("URA", "NYSEARCA"), "AMEX:URA");
  assert.equal(symbolFor("GDX", "ARCA"), "AMEX:GDX");
});

test("ASX and LSE listings keep their own venues", () => {
  assert.equal(symbolFor("SLVM", "ASX"), "ASX:SLVM");
  assert.equal(symbolFor("ATOM", "ASX"), "ASX:ATOM");
  assert.equal(symbolFor("XRH0", "LSE"), "LSE:XRH0");
  assert.equal(symbolFor("XRH0", "GB"), "LSE:XRH0");
});

test("an unknown exchange is passed through rather than guessed at", () => {
  assert.equal(symbolFor("ABC", "XETR"), "XETR:ABC");
  assert.equal(symbolFor("ABC", ""), "ABC");
});
