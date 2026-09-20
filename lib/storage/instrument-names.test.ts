import assert from "node:assert/strict";
import test from "node:test";
import { canonicalInstrumentName } from "./instrument-names";

test("canonicalInstrumentName names Barrick's B listing", () => {
  assert.equal(canonicalInstrumentName("B", "B"), "Barrick Mining Corporation");
  assert.equal(canonicalInstrumentName("b", undefined), "Barrick Mining Corporation");
  assert.equal(canonicalInstrumentName("B", "Barrick Gold Corporation"), "Barrick Mining Corporation");
});

test("canonicalInstrumentName leaves unlisted instruments alone", () => {
  assert.equal(canonicalInstrumentName("CDE", "Coeur Mining"), "Coeur Mining");
  assert.equal(canonicalInstrumentName("ASL", undefined), "ASL");
});
