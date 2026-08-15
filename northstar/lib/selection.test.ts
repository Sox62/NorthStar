import assert from "node:assert/strict";
import test from "node:test";
import { RESEARCH_BENCHMARKS } from "./benchmark-tree";
import { parseSelectionValue, selectionValue } from "./selection";

test("a namespaced benchmark id survives the round trip", () => {
  // "benchmark:reserve:gold" used to parse to id "reserve", so GOLD could never be selected.
  assert.deepEqual(parseSelectionValue(selectionValue("benchmark", "reserve:gold")), {
    kind: "benchmark",
    id: "reserve:gold",
  });
  assert.deepEqual(parseSelectionValue(selectionValue("benchmark", "commodity:platinum")), {
    kind: "benchmark",
    id: "commodity:platinum",
  });
});

test("every research benchmark round-trips to its own id", () => {
  for (const node of RESEARCH_BENCHMARKS) {
    assert.deepEqual(
      parseSelectionValue(selectionValue("benchmark", node.id)),
      { kind: "benchmark", id: node.id },
      `${node.symbol ?? node.label} must resolve back to ${node.id}`,
    );
  }
});

test("holdings use plain ids and still round trip", () => {
  assert.deepEqual(parseSelectionValue(selectionValue("holding", "abc-123")), { kind: "holding", id: "abc-123" });
});

test("empty and malformed values are rejected rather than half-parsed", () => {
  assert.equal(selectionValue("benchmark", ""), "");
  assert.equal(parseSelectionValue(""), null);
  assert.equal(parseSelectionValue("benchmark"), null, "no separator");
  assert.equal(parseSelectionValue("benchmark:"), null, "no id");
  assert.equal(parseSelectionValue(":reserve:gold"), null, "no kind");
  assert.equal(parseSelectionValue("something:else"), null, "unknown kind");
});

test("benchmark TradingView symbols carry a venue that TradingView actually lists them on", () => {
  // TVC lists GOLD, SILVER and USOIL but not platinum, so PLATINUM must name a venue that
  // quotes it. The prefix is not cosmetic: historyForBenchmark and backfillKeyForBenchmark
  // both derive the price-store exchange from it.
  for (const node of RESEARCH_BENCHMARKS) {
    if (!node.tradingViewSymbol) continue;
    const [venue, ticker] = node.tradingViewSymbol.split(":");
    assert.ok(venue && ticker, `${node.id} needs a VENUE:TICKER TradingView symbol`);
    // Currency benchmarks quote a pair, so the ticker legitimately differs from the symbol.
    if (node.role !== "reserve" || node.symbol === "GOLD") {
      assert.equal(ticker, node.symbol, `${node.id} TradingView ticker must match its symbol`);
    }
    if (node.symbol === "PLATINUM") assert.equal(venue, "ACTIVTRADES");
  }
});
