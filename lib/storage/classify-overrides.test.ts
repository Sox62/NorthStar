import assert from "node:assert/strict";
import test from "node:test";
import { classifyAsset } from "./classify";
import { sectorOverrideMap } from "@/lib/core/accounting";

test("the three reported symbols now classify correctly by default", () => {
  assert.equal(classifyAsset("XOP", "XOP"), "Oil");
  assert.equal(classifyAsset("GGP", "GGP"), "Gold miners");
  assert.equal(classifyAsset("HSTR", "HSTR"), "Gold miners");
});

test("an override beats the built-in map", () => {
  // GDX is hardcoded as a gold miner; the user gets the last word.
  assert.equal(classifyAsset("GDX", "Gold Miners ETF"), "Gold miners");
  assert.equal(classifyAsset("GDX", "Gold Miners ETF", { GDX: "Broad equities" }), "Broad equities");
});

test("an override beats the keyword rules", () => {
  assert.equal(classifyAsset("ZZZ", "Something Silver Mining"), "Silver miners");
  assert.equal(classifyAsset("ZZZ", "Something Silver Mining", { ZZZ: "Oil" }), "Oil");
});

test("an override rescues a symbol the classifier cannot place", () => {
  assert.equal(classifyAsset("QQQX", "QQQX"), "Broad equities", "unknown tickers fall here");
  assert.equal(classifyAsset("QQQX", "QQQX", { QQQX: "Uranium miners" }), "Uranium miners");
});

test("override lookup is case-insensitive on the symbol", () => {
  const map = sectorOverrideMap([{ symbol: "xop", sector: "Gold miners", updatedAt: "2026-08-16T00:00:00.000Z" }]);
  assert.deepEqual(map, { XOP: "Gold miners" });
  assert.equal(classifyAsset("XOP", "XOP", map), "Gold miners", "beats the built-in Oil mapping");
});

test("no overrides leaves the classifier untouched", () => {
  assert.equal(classifyAsset("XOP", "XOP", sectorOverrideMap([])), "Oil");
  assert.equal(classifyAsset("XOP", "XOP", sectorOverrideMap()), "Oil");
});
