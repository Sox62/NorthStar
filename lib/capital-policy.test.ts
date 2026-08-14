import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCapitalPolicySummary, openBuyCommitmentAud } from "./capital-policy";
import type { DashboardData, StoredOpenOrder } from "./storage";

function order(input: Partial<StoredOpenOrder>): StoredOpenOrder {
  return {
    id: "order-1",
    ownerType: "SMSF",
    broker: "IBKR",
    accountKey: "U123",
    orderId: "1",
    conid: "",
    symbol: "STO",
    name: "Santos",
    exchange: "ASX",
    currency: "AUD",
    side: "BUY",
    status: "Submitted",
    orderType: "Limit",
    timeInForce: "GTC",
    totalQuantity: 1000,
    filledQuantity: 0,
    remainingQuantity: 1000,
    limitPrice: 8,
    stopPrice: null,
    averagePrice: null,
    description: "",
    createdAt: null,
    updatedAt: null,
    asOfDate: "2026-08-14",
    source: "test",
    ...input,
  };
}

function dashboard(input: Partial<DashboardData>): DashboardData {
  return {
    scope: "smsf",
    storageMode: "local-file",
    totalValue: 0,
    investedValue: 0,
    cashValue: 0,
    dailyMovement: 0,
    totalReturn: 0,
    totalReturnPercent: 0,
    holdings: [],
    cashAccounts: [],
    allocations: [],
    performance: [],
    periodReturns: [],
    xirr: { valuePercent: null, startDate: null, endDate: null, cashFlowCount: 0, fallbackPositionCount: 0, terminalValue: 0, note: "" },
    income: { periodStart: "", periodEnd: "", dividendCount: 0, netCashAud: 0, taxWithheldAud: 0, frankingCreditsAud: 0, grossIncomeAud: 0, grossedUpYieldPercent: null, symbols: [], note: "" },
    allocationTargets: [],
    currencyExposure: [],
    accounts: [],
    syncRuns: [],
    freshness: [],
    provisionalValue: 0,
    currentValue: 0,
    lastUpdated: null,
    ...input,
  };
}

test("openBuyCommitmentAud counts active AUD buy orders only", () => {
  const result = openBuyCommitmentAud([
    order({ remainingQuantity: 2500, limitPrice: 8.5 }),
    order({ orderId: "2", side: "SELL", remainingQuantity: 1000, limitPrice: 7 }),
    order({ orderId: "3", status: "Cancelled", remainingQuantity: 1000, limitPrice: 7 }),
  ]);
  assert.equal(result.aud, 21_250);
  assert.equal(result.foreignCount, 0);
});

test("foreign open buys are flagged rather than silently converted", () => {
  const result = openBuyCommitmentAud([order({ currency: "USD", remainingQuantity: 100, limitPrice: 50 })]);
  assert.equal(result.aud, 0);
  assert.equal(result.foreignCount, 1);
});

test("SMSF deployable cash respects floor and open buy commitments", () => {
  const summary = buildCapitalPolicySummary(
    dashboard({ scope: "smsf", cashValue: 120_000 }),
    [order({ remainingQuantity: 2500, limitPrice: 8 })],
  );
  assert.equal(summary.liquidityFloorAud, 50_000);
  assert.equal(summary.openBuyCommitmentAud, 20_000);
  assert.equal(summary.deployableCashAud, 50_000);
  assert.equal(summary.status, "deployable");
});
