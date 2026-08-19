import assert from "node:assert/strict";
import test from "node:test";
import { MARKET_TILE_INSTRUMENTS, previousCloseFromSeries } from "./market-tiles";

test("the live session is not used as its own previous close", () => {
  // The last bar is the session in progress. Comparing the price against it reports no move at all.
  const bars = [
    { date: "2026-08-17", close: 4417.8 },
    { date: "2026-08-18", close: 4366 },
    { date: "2026-08-19", close: 4410.4 },
  ];
  assert.equal(previousCloseFromSeries(bars), 4366);
});

test("a session Yahoo has opened but not yet priced still looks back one session", () => {
  // Gold's real shape overnight: the 19 Aug bar exists with an empty close while the futures
  // session runs. Treating the last *priced* bar as current compared 18 Aug's price against
  // 17 Aug's close and reported -0.19% while gold was up about 1%.
  const bars = [
    { date: "2026-08-14", close: 4380.4 },
    { date: "2026-08-17", close: 4417.8 },
    { date: "2026-08-18", close: 4366 },
    { date: "2026-08-19", close: null },
  ];
  assert.equal(previousCloseFromSeries(bars), 4366);
});

test("with the market shut, the move is still measured across the last completed session", () => {
  const bars = [
    { date: "2026-08-14", close: 4380.4 },
    { date: "2026-08-17", close: 4417.8 },
    { date: "2026-08-18", close: 4366 },
  ];
  assert.equal(previousCloseFromSeries(bars), 4417.8);
});

test("the close before the requested range is never mistaken for yesterday's", () => {
  // Yahoo's meta.chartPreviousClose is exactly this first value; using it put gold at +0.7%
  // against a real move of +1.0%, which is the defect this function exists to prevent.
  const bars = [
    { date: "2026-08-14", close: 4380.4 },
    { date: "2026-08-17", close: 4417.8 },
    { date: "2026-08-18", close: 4366 },
    { date: "2026-08-19", close: 4410.4 },
  ];
  assert.notEqual(previousCloseFromSeries(bars), 4380.4);
});

test("gaps and bad closes are skipped rather than charted as a crash", () => {
  const bars = [
    { date: "2026-08-17", close: 4417.8 },
    { date: "2026-08-18", close: 0 },
    { date: "2026-08-19", close: Number.NaN },
    { date: "2026-08-20", close: 4410.4 },
  ];
  assert.equal(previousCloseFromSeries(bars), 4417.8);
});

test("a series too short to hold a prior session yields no close", () => {
  assert.equal(previousCloseFromSeries([]), null);
  assert.equal(previousCloseFromSeries([{ date: "2026-08-19", close: 4410.4 }]), null);
  assert.equal(previousCloseFromSeries([{ date: "2026-08-19", close: null }]), null);
});

test("every tile declares a currency and unit, so no price renders bare", () => {
  const keys = new Set<string>();
  for (const instrument of MARKET_TILE_INSTRUMENTS) {
    assert.ok(instrument.providerSymbol, `${instrument.key} needs a provider symbol`);
    assert.match(instrument.currency, /^[A-Z]{3}$/, `${instrument.key} needs an ISO currency`);
    assert.ok(!keys.has(instrument.key), `${instrument.key} is listed twice`);
    keys.add(instrument.key);
  }
  // Sprott trades in Toronto: assuming USD here would misprice the uranium tile by the cross rate.
  assert.equal(MARKET_TILE_INSTRUMENTS.find((tile) => tile.key === "uranium")?.currency, "CAD");
});
