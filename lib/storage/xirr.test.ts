import assert from "node:assert/strict";
import test from "node:test";
import { buildXirrSummary, calculateXirr } from "./xirr";
import type { StoredPosition } from "./types";

test("calculateXirr solves a simple annual return", () => {
  const rate = calculateXirr([
    { date: "2025-01-01", amount: -1000, source: "initial" },
    { date: "2026-01-01", amount: 1100, source: "terminal" },
  ]);

  assert.ok(rate != null);
  assert.ok(Math.abs(rate * 100 - 10) < 0.01);
});

test("buildXirrSummary uses cost-basis fallback when no trade history exists", () => {
  const position: StoredPosition = {
    id: "position-1",
    ownerType: "PERSONAL",
    broker: "Directshares",
    accountKey: "4317403",
    instrumentKey: "Directshares:LAM:TSX/TSXV",
    symbol: "LAM",
    name: "Laramide Resources",
    exchange: "TSX/TSXV",
    currency: "CAD",
    assetClass: "Uranium",
    quantity: 1000,
    lastPrice: 1.1,
    averageCostAud: 1,
    costAud: 1000,
    marketValueAud: 1150,
    dayGainAud: 0,
    pnlAud: 150,
    pnlPercent: 15,
    valuationBasis: "market",
    asOfDate: "2025-01-01",
    source: "Directshares CSV",
  };

  const summary = buildXirrSummary({
    scope: "personal",
    positions: [position],
    cashAccounts: [],
    transactions: [],
    asOfDate: "2026-01-01",
  });

  assert.equal(summary.fallbackPositionCount, 1);
  assert.equal(summary.cashFlowCount, 2);
  assert.ok(summary.valuePercent != null);
  assert.ok(summary.valuePercent > 14.9 && summary.valuePercent < 15.1);
});
