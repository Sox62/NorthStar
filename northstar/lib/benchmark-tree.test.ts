import assert from "node:assert/strict";
import test from "node:test";
import { benchmarkSymbols, resolveBenchmarkTree } from "./benchmark-tree";

function rolesFor(symbol: string, name: string, sector?: Parameters<typeof resolveBenchmarkTree>[0]["sector"], exchange?: string) {
  return resolveBenchmarkTree({ symbol, name, sector, exchange });
}

test("silver miners ladder from gold through silver and SLVM before the candidate", () => {
  const tree = rolesFor("CDE", "Coeur Mining Inc", "Silver miners", "NYSE");
  assert.equal(tree.sector, "Silver miners");
  assert.deepEqual(tree.path.map((node) => node.role), ["reserve", "commodity", "sector_etf", "leader", "candidate"]);
  assert.deepEqual(tree.path.map((node) => node.symbol), ["GOLD", "SILVER", "SLVM", "PAAS", "CDE"]);
  assert.equal(tree.path.at(-1)?.tradingViewSymbol, "NYSE:CDE");
  assert.ok(tree.peers.some((node) => node.symbol === "SILJ"));
});

test("silver ETF holdings are candidates, not duplicated as their own benchmark", () => {
  const tree = rolesFor("SLVM", "Global X Silver Miners ETF", "Silver miners", "ASX");
  assert.deepEqual(tree.path.map((node) => node.symbol), ["GOLD", "SILVER", "SLVM"]);
  assert.equal(tree.path.at(-1)?.role, "candidate");
  assert.equal(tree.path.at(-1)?.tradingViewSymbol, "ASX:SLVM");
});

test("uranium miners use gold, U3O8, URNM and CCJ", () => {
  const tree = rolesFor("PDN", "Paladin Energy", "Uranium miners", "ASX");
  assert.deepEqual(tree.path.map((node) => node.symbol), ["GOLD", "U3O8", "URNM", "CCJ", "PDN"]);
  assert.equal(tree.path.at(-1)?.tradingViewSymbol, "ASX:PDN");
  assert.ok(tree.peers.some((node) => node.symbol === "URA"));
});

test("oil holdings use gold, oil, XLE, XOM and the candidate", () => {
  const tree = rolesFor("EC", "Ecopetrol SA Sponsored ADR", "Oil", "NYSE");
  assert.deepEqual(tree.path.map((node) => node.symbol), ["GOLD", "USOIL", "XLE", "XOM", "EC"]);
  assert.ok(tree.peers.some((node) => node.symbol === "XOP"));
});

test("physical platinum is labelled as a metal holding under gold and platinum", () => {
  const tree = rolesFor("PLATINUM", "Physical platinum", "Platinum bullion");
  assert.deepEqual(tree.path.map((node) => node.symbol), ["GOLD", "PLATINUM"]);
  assert.equal(tree.path.at(-1)?.role, "candidate");
  assert.match(tree.notes.join(" "), /strategic metal holding|physical platinum/);
});

test("ETPMAG keeps the Global X historical-data caveat", () => {
  const tree = rolesFor("ETPMAG", "Global X Physical Silver", "Silver bullion", "ASX");
  assert.deepEqual(tree.path.map((node) => node.symbol), ["GOLD", "SILVER", "ETPMAG"]);
  assert.match(tree.notes.join(" "), /Global X NAV feed/);
});

test("benchmarkSymbols returns non-candidate chartable benchmarks", () => {
  const tree = rolesFor("AYA", "Aya Gold & Silver", "Silver miners", "TSX");
  const symbols = benchmarkSymbols(tree).map((node) => node.symbol);
  assert.deepEqual(symbols, ["GOLD", "SILVER", "SLVM", "PAAS", "SIL", "SILJ", "WPM"]);
});
