import assert from "node:assert/strict";
import test from "node:test";
import { classifyAsset } from "./classify";
import { sectorForInstrument } from "@/southernstar/lib/sector-map";

test("classifyAsset preserves known SouthernStar exceptions", () => {
  assert.equal(classifyAsset("VELO", "Velocity Composites"), "Technology");
  assert.equal(classifyAsset("LAM", "Laramide Resources"), "Uranium explorers");
});

test("sectorForInstrument maps live exceptions to the intended dashboard sectors", () => {
  assert.equal(sectorForInstrument({ symbol: "VELO", name: "Velocity Composites", assetClass: "Technology" }), "Technology");
  assert.equal(sectorForInstrument({ symbol: "LAM", name: "Laramide Resources", assetClass: "Broad equities" }), "Uranium explorers");
});

test("classifyAsset maps known SouthernStar resource holdings and unknown broad assets", () => {
  assert.equal(classifyAsset("ASL", "ASL"), "Silver miners");
  assert.equal(classifyAsset("ASL", "Andean Silver"), "Silver miners");
  assert.equal(classifyAsset("B", "B"), "Gold miners");
  assert.equal(classifyAsset("WRN", "WRN"), "Gold miners");
  assert.equal(classifyAsset("DBA", "Invesco DB Agriculture Fund"), "Soft commodities");
  assert.equal(classifyAsset("XRH0", "Xtrackers Physical Rhodium"), "Rhodium metal");
  assert.equal(classifyAsset("EU", "enCore Energy Corp"), "Uranium miners");
  assert.equal(classifyAsset("EU", "Encore Energy"), "Uranium miners");
});

test("classifyAsset treats PMGOLD as a gold proxy, not a miner", () => {
  assert.equal(classifyAsset("PMGOLD", "Perth Mint Gold"), "Gold bullion");
  assert.equal(sectorForInstrument({ symbol: "PMGOLD", name: "Perth Mint Gold", assetClass: "Gold" }), "Gold bullion");
  assert.equal(classifyAsset("GOLD", "Physical gold"), "Gold bullion");
  assert.equal(classifyAsset("ZZZ", "Physical gold bullion"), "Gold bullion");
  assert.equal(classifyAsset("ZZZ", "Barrick Gold"), "Gold miners");
});
