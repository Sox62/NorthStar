import assert from "node:assert/strict";
import test from "node:test";
import { canonicalInstrumentName } from "./instrument-names";

test("canonicalInstrumentName names Barrick's B listing", () => {
  assert.equal(canonicalInstrumentName("B", "B"), "Barrick Mining Corporation");
  assert.equal(canonicalInstrumentName("b", undefined), "Barrick Mining Corporation");
  assert.equal(canonicalInstrumentName("B", "Barrick Gold Corporation"), "Barrick Mining Corporation");
});

test("canonicalInstrumentName names key silver miners", () => {
  assert.equal(canonicalInstrumentName("EDR", "EDR"), "Endeavour Silver Corp.");
  assert.equal(canonicalInstrumentName("edr", "Endeavour Silver Corp"), "Endeavour Silver Corp.");
  assert.equal(canonicalInstrumentName("HL", "Hecla"), "Hecla Mining Company");
  assert.equal(canonicalInstrumentName("hl", undefined), "Hecla Mining Company");
});

test("canonicalInstrumentName names Deep Yellow's DYL listing", () => {
  assert.equal(canonicalInstrumentName("DYL", "DYL"), "Deep Yellow Limited");
  assert.equal(canonicalInstrumentName("dyl", "Deep Yellow"), "Deep Yellow Limited");
});

test("canonicalInstrumentName names Laramide's LAM listing", () => {
  assert.equal(canonicalInstrumentName("LAM", "LAM"), "Laramide Resources Ltd.");
  assert.equal(canonicalInstrumentName("lam", "Laramide"), "Laramide Resources Ltd.");
});

test("canonicalInstrumentName names the known SouthernStar miner and ETF universe", () => {
  const cases = [
    ["AG", "First Majestic Silver", "First Majestic Silver Corp."],
    ["ASL", "Andean Silver", "Andean Silver Limited"],
    ["ASM", "Avino Silver & Gold Mines", "Avino Silver & Gold Mines Ltd."],
    ["AYA", "Aya Gold & Silver", "Aya Gold & Silver Inc."],
    ["BMN", "Bannerman Energy", "Bannerman Energy Ltd."],
    ["CCJ", "Cameco", "Cameco Corp."],
    ["CDE", "Coeur Mining", "Coeur Mining Inc."],
    ["DML", "Denison Mines", "Denison Mines Corp."],
    ["COP", "CONOCOPHILLIPS", "ConocoPhillips"],
    ["CORN", "TEUCRIUM CORN FUND", "Teucrium Corn Fund"],
    ["ETPMAG", "Global X Physical Silver Structured", "Global X Physical Silver"],
    ["EU", "enCore Energy", "enCore Energy Corp."],
    ["GGP", "Greatland Resources", "Greatland Resources Limited"],
    ["HSTR", "Heliostar Metals", "Heliostar Metals Ltd."],
    ["KGC", "Kinross Gold", "Kinross Gold Corporation"],
    ["MAG", "MAG Silver", "MAG Silver Corp."],
    ["MGY", "MAGNOLIA OIL & GAS CORP - A", "Magnolia Oil & Gas Corp."],
    ["NEM", "Newmont", "Newmont Corporation"],
    ["NST", "Northern Star Resources", "Northern Star Resources Ltd."],
    ["NXG", "NexGen Energy", "NexGen Energy Ltd."],
    ["PAAS", "Pan American Silver", "Pan American Silver Corp."],
    ["PDN", "Paladin Energy", "Paladin Energy Ltd."],
    ["RRL", "Regis Resources", "Regis Resources Limited"],
    ["SCZ", "Santacruz Silver Mining", "Santacruz Silver Mining Ltd."],
    ["STNG", "SCORPIO TANKERS INC", "Scorpio Tankers Inc."],
    ["SVM", "Silvercorp Metals", "Silvercorp Metals Inc."],
    ["UUUU", "Energy Fuels", "Energy Fuels Inc."],
    ["VAU", "Vault Minerals", "Vault Minerals Limited"],
    ["WGX", "WESTGOLD RESOURCES LTD", "Westgold Resources Limited"],
    ["WRN", "Western Copper & Gold", "Western Copper and Gold Corporation"],
    ["URNM", "BetaShares Global Uranium ETF", "BetaShares Global Uranium ETF"],
    ["U.UN", "Sprott Physical Uranium Trust", "Sprott Physical Uranium Trust"],
    ["CMM", "Capricorn Metals", "Capricorn Metals Ltd."],
    ["LEU", "Centrus Energy", "Centrus Energy Corp."],
    ["SLX", "Silex Systems", "Silex Systems Limited"],
    ["XOM", "Exxon Mobil", "Exxon Mobil Corporation"],
  ] as const;

  for (const [symbol, rawName, expected] of cases) {
    assert.equal(canonicalInstrumentName(symbol, rawName), expected);
  }
});

test("canonicalInstrumentName leaves unlisted instruments alone", () => {
  assert.equal(canonicalInstrumentName("XYZ", "Example Resources"), "Example Resources");
  assert.equal(canonicalInstrumentName("XYZ", undefined), "XYZ");
});
