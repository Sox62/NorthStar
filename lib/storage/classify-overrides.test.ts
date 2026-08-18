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

test("the new categories exist and classify by symbol and by keyword", () => {
  assert.equal(classifyAsset("DBA", "Invesco DB Agriculture Fund"), "Soft commodities");
  assert.equal(classifyAsset("ZZZ", "Global Copper Mining Corp"), "Copper miners");
  assert.equal(classifyAsset("ZZZ", "Whitehaven Coal"), "Coal");
  assert.equal(classifyAsset("ZZZ", "Wheat and Corn Basket"), "Soft commodities");
});

test("coal matches as a word, not inside another one", () => {
  // "Coalition" and "Charcoal" must not become coal holdings.
  assert.notEqual(classifyAsset("ZZZ", "Coalition Resources Group"), "Coal");
  assert.equal(classifyAsset("ZZZ", "Peabody Energy"), "Coal");
});

test("every sector has a colour, a composition group and a benchmark template", async () => {
  const { SECTOR_COLORS, COMPOSITION_OF } = await import("@/northstar/types");
  const { defaultTargetAllocation } = await import("@/northstar/lib/allocation-drift");
  for (const sector of ["Copper miners", "Coal", "Soft commodities"] as const) {
    assert.ok(SECTOR_COLORS[sector], `${sector} needs a colour`);
    assert.ok(COMPOSITION_OF[sector], `${sector} needs a composition group`);
    assert.equal(typeof defaultTargetAllocation[sector], "number", `${sector} needs a default target`);
  }
});
