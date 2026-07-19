import assert from "node:assert/strict";
import test from "node:test";
import { classifyAsset } from "./classify";
import { sectorForInstrument } from "@/northstar/lib/sector-map";

test("classifyAsset preserves known NorthStar exceptions", () => {
  assert.equal(classifyAsset("VELO", "Velocity Composites"), "Technology");
  assert.equal(classifyAsset("LAM", "Laramide Resources"), "Uranium");
});

test("sectorForInstrument maps live exceptions to the intended dashboard sectors", () => {
  assert.equal(sectorForInstrument({ symbol: "VELO", name: "Velocity Composites", assetClass: "Technology" }), "Technology");
  assert.equal(sectorForInstrument({ symbol: "LAM", name: "Laramide Resources", assetClass: "Uranium" }), "Uranium explorers");
});
