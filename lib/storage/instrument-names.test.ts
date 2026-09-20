import assert from "node:assert/strict";
import test from "node:test";
import { canonicalInstrumentName } from "./instrument-names";

test("canonicalInstrumentName names Barrick's B listing", () => {
  assert.equal(canonicalInstrumentName("B", "B"), "Barrick Mining Corporation");
  assert.equal(canonicalInstrumentName("b", undefined), "Barrick Mining Corporation");
  assert.equal(canonicalInstrumentName("B", "Barrick Gold Corporation"), "Barrick Mining Corporation");
});

test("canonicalInstrumentName names key silver miners", () => {
  assert.equal(canonicalInstrumentName("EDR", "EDR"), "Endeavour Silver Corp");
  assert.equal(canonicalInstrumentName("edr", "Endeavour Silver Corp."), "Endeavour Silver Corp");
  assert.equal(canonicalInstrumentName("HL", "Hecla Mining Company"), "Hecla");
  assert.equal(canonicalInstrumentName("hl", undefined), "Hecla");
});

test("canonicalInstrumentName names Deep Yellow's DYL listing", () => {
  assert.equal(canonicalInstrumentName("DYL", "DYL"), "Deep Yellow");
  assert.equal(canonicalInstrumentName("dyl", "Deep Yellow Limited"), "Deep Yellow");
});

test("canonicalInstrumentName leaves unlisted instruments alone", () => {
  assert.equal(canonicalInstrumentName("CDE", "Coeur Mining"), "Coeur Mining");
  assert.equal(canonicalInstrumentName("ASL", undefined), "ASL");
});
