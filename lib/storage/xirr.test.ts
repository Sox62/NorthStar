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

test("buildXirrSummary hides XIRR when current holdings are only a same-day valuation fallback", () => {
  const position: StoredPosition = {
    id: "position-1",
    ownerType: "SMSF",
    broker: "IBKR",
    accountKey: "U123",
    instrumentKey: "IBKR:CDE:NYSE",
    symbol: "CDE",
    name: "Coeur Mining",
    exchange: "NYSE",
    currency: "USD",
    assetClass: "Silver miners",
    quantity: 500,
    lastPrice: 15,
    averageCostAud: 25,
    costAud: 12_500,
    marketValueAud: 11_500,
    dayGainAud: 0,
    pnlAud: -1000,
    pnlPercent: -8,
    valuationBasis: "market",
    asOfDate: "2026-07-31",
    source: "IBKR Open Positions",
  };

  const summary = buildXirrSummary({
    scope: "smsf",
    positions: [position],
    cashAccounts: [],
    transactions: [],
    asOfDate: "2026-08-01",
  });

  assert.equal(summary.valuePercent, null);
  assert.equal(summary.fallbackPositionCount, 0);
  assert.match(summary.note, /terminal NAV includes 1 position/);
});

test("buildXirrSummary hides XIRR when a Flex transaction window does not explain the terminal quantity", () => {
  const position: StoredPosition = {
    id: "position-1",
    ownerType: "SMSF",
    broker: "IBKR",
    accountKey: "U123",
    instrumentKey: "IBKR:CDE:NYSE",
    symbol: "CDE",
    name: "Coeur Mining",
    exchange: "NYSE",
    currency: "USD",
    assetClass: "Silver miners",
    quantity: 500,
    lastPrice: 15,
    averageCostAud: 25,
    costAud: 12_500,
    marketValueAud: 11_500,
    dayGainAud: 0,
    pnlAud: -1000,
    pnlPercent: -8,
    valuationBasis: "market",
    asOfDate: "2026-07-31",
    source: "IBKR Open Positions",
  };

  const summary = buildXirrSummary({
    scope: "smsf",
    positions: [position],
    cashAccounts: [],
    transactions: [{
      id: "txn-1",
      ownerType: "SMSF",
      broker: "IBKR",
      accountKey: "U123",
      externalId: "buy-1",
      externalAccountId: "U123",
      tradeDate: "2026-07-31",
      symbol: "CDE",
      exchange: "NYSE",
      type: "BUY",
      quantity: 10,
      price: 15,
      cost: 150,
      currency: "USD",
      fxRateToBase: 1.5,
      netCash: -225,
      source: "IBKR Flex",
    }],
    asOfDate: "2026-08-01",
  });

  assert.equal(summary.valuePercent, null);
  assert.equal(summary.fallbackPositionCount, 0);
  assert.match(summary.note, /without dated acquisition/);
});

test("buildXirrSummary hides XIRR when imported sells have no matching acquisition history", () => {
  const summary = buildXirrSummary({
    scope: "smsf",
    positions: [],
    cashAccounts: [],
    transactions: [{
      id: "txn-1",
      ownerType: "SMSF",
      broker: "IBKR",
      accountKey: "U123",
      externalId: "sell-1",
      externalAccountId: "U123",
      tradeDate: "2026-07-31",
      symbol: "CDE",
      exchange: "NYSE",
      type: "SELL",
      quantity: -100,
      price: 15,
      cost: -1500,
      currency: "USD",
      fxRateToBase: 1.5,
      netCash: 2250,
      source: "IBKR Flex",
    }],
    asOfDate: "2026-08-01",
  });

  assert.equal(summary.valuePercent, null);
  assert.match(summary.note, /legacy sale/);
});
