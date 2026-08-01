import assert from "node:assert/strict";
import test from "node:test";
import { classifyAsset } from "./classify";
import { sectorForInstrument } from "@/northstar/lib/sector-map";

test("classifyAsset preserves known NorthStar exceptions", () => {
  assert.equal(classifyAsset("VELO", "Velocity Composites"), "Technology");
  assert.equal(classifyAsset("LAM", "Laramide Resources"), "Uranium explorers");
});

test("sectorForInstrument maps live exceptions to the intended dashboard sectors", () => {
  assert.equal(sectorForInstrument({ symbol: "VELO", name: "Velocity Composites", assetClass: "Technology" }), "Technology");
  assert.equal(sectorForInstrument({ symbol: "LAM", name: "Laramide Resources", assetClass: "Broad equities" }), "Uranium explorers");
});

test("classifyAsset maps known NorthStar resource holdings and unknown broad assets", () => {
  assert.equal(classifyAsset("ASL", "ASL"), "Silver miners");
  assert.equal(classifyAsset("ASL", "Andean Silver"), "Silver miners");
  assert.equal(classifyAsset("B", "B"), "Gold miners");
  assert.equal(classifyAsset("WRN", "WRN"), "Gold miners");
  assert.equal(classifyAsset("DBA", "Invesco DB Agriculture Fund"), "Broad equities");
  assert.equal(classifyAsset("XRH0", "Xtrackers Physical Rhodium"), "Rhodium metal");
});
