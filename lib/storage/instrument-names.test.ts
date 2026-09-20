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

test("canonicalInstrumentName names Laramide's LAM listing", () => {
  assert.equal(canonicalInstrumentName("LAM", "LAM"), "Laramide");
  assert.equal(canonicalInstrumentName("lam", "Laramide Resources Ltd."), "Laramide");
});

test("canonicalInstrumentName names the known SouthernStar miner and ETF universe", () => {
  const cases = [
    ["AG", "First Majestic Silver Corp.", "First Majestic Silver"],
    ["ASL", "Andean Silver Limited", "Andean Silver"],
    ["ASM", "Avino Silver & Gold Mines Ltd.", "Avino Silver & Gold Mines"],
    ["AYA", "Aya Gold & Silver Inc.", "Aya Gold & Silver"],
    ["BMN", "Bannerman Energy Ltd.", "Bannerman Energy"],
    ["CCJ", "Cameco Corp.", "Cameco"],
    ["CDE", "Coeur Mining Inc.", "Coeur Mining"],
    ["DML", "Denison Mines Corp.", "Denison Mines"],
    ["ETPMAG", "Global X Physical Silver Structured", "Global X Physical Silver"],
    ["EU", "enCore Energy Corp.", "enCore Energy"],
    ["GGP", "Greatland Resources Limited", "Greatland Resources"],
    ["HSTR", "Heliostar Metals Ltd.", "Heliostar Metals"],
    ["KGC", "Kinross Gold Corporation", "Kinross Gold"],
    ["MAG", "MAG Silver Corp.", "MAG Silver"],
    ["NEM", "Newmont Corporation", "Newmont"],
    ["NST", "Northern Star Resources Ltd.", "Northern Star Resources"],
    ["NXG", "NexGen Energy Ltd.", "NexGen Energy"],
    ["PAAS", "Pan American Silver Corp.", "Pan American Silver"],
    ["PDN", "Paladin Energy Ltd.", "Paladin Energy"],
    ["RRL", "Regis Resources Limited", "Regis Resources"],
    ["SCZ", "Santacruz Silver Mining Ltd.", "Santacruz Silver Mining"],
    ["SVM", "Silvercorp Metals Inc.", "Silvercorp Metals"],
    ["UUUU", "Energy Fuels Inc.", "Energy Fuels"],
    ["VAU", "Vault Minerals Limited", "Vault Minerals"],
    ["WRN", "Western Copper and Gold Corporation", "Western Copper & Gold"],
    ["URNM", "BetaShares Global Uranium ETF", "BetaShares Global Uranium ETF"],
    ["U.UN", "Sprott Physical Uranium Trust", "Sprott Physical Uranium Trust"],
  ] as const;

  for (const [symbol, rawName, expected] of cases) {
    assert.equal(canonicalInstrumentName(symbol, rawName), expected);
  }
});

test("canonicalInstrumentName leaves unlisted instruments alone", () => {
  assert.equal(canonicalInstrumentName("XYZ", "Example Resources"), "Example Resources");
  assert.equal(canonicalInstrumentName("XYZ", undefined), "XYZ");
});
