import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStopsRiskDashboard } from "./stops";
import type { DashboardData, PositionRiskPlan, PriceBook, Scope, StorageAdapter, StoredOpenOrder, StoredPosition } from "@/lib/storage";

const freshBrokerOrderDate = new Date().toISOString().slice(0, 10);
const freshBrokerOrderTimestamp = `${freshBrokerOrderDate}T00:00:00.000Z`;

const basePosition: StoredPosition = {
  id: "pos-cde",
  ownerType: "PERSONAL",
  broker: "IBKR",
  accountKey: "U1",
  instrumentKey: "IBKR:CDE:US",
  symbol: "CDE",
  name: "Coeur Mining",
  exchange: "US",
  currency: "USD",
  assetClass: "Silver miners",
  quantity: 100,
  lastPrice: 10,
  averageCostAud: 15,
  costAud: 1500,
  marketValueAud: 1500,
  dayGainAud: 0,
  pnlAud: 0,
  pnlPercent: 0,
  valuationBasis: "market",
  asOfDate: "2026-09-14",
  source: "test",
};

function dashboard(scope: Scope, holdings = [{ ...basePosition, weight: 15 }]): DashboardData {
  return {
    scope,
    storageMode: "local-file",
    totalValue: scope === "overall" ? 10_000 : scope === "personal" ? 8_000 : 2_000,
    investedValue: holdings.reduce((sum, position) => sum + position.marketValueAud, 0),
    cashValue: scope === "smsf" ? 2000 : 6500,
    dailyMovement: 0,
    totalReturn: 0,
    totalReturnPercent: 0,
    holdings,
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
    lastUpdated: "2026-09-14T00:00:00.000Z",
  };
}

function priceBook(): PriceBook {
  return {
    instruments: [],
    fxRates: [{ id: "fx-usd", currency: "USD", rateToAud: 1.5, rateDate: "2026-09-14", source: "test", retrievedAt: "2026-09-14T00:00:00.000Z" }],
    prices: [
      { id: "cde-1", instrumentId: null, symbol: "CDE", exchange: "US", name: "CDE", currency: "USD", close: 8, priceDate: "2026-08-14", source: "test", retrievedAt: "2026-08-14T00:00:00.000Z" },
      { id: "cde-2", instrumentId: null, symbol: "CDE", exchange: "US", name: "CDE", currency: "USD", close: 10, priceDate: "2026-09-14", source: "test", retrievedAt: "2026-09-14T00:00:00.000Z" },
      { id: "silj-1", instrumentId: null, symbol: "SILJ", exchange: "US", name: "SILJ", currency: "USD", close: 10, priceDate: "2026-08-14", source: "test", retrievedAt: "2026-08-14T00:00:00.000Z" },
      { id: "silj-2", instrumentId: null, symbol: "SILJ", exchange: "US", name: "SILJ", currency: "USD", close: 11, priceDate: "2026-09-14", source: "test", retrievedAt: "2026-09-14T00:00:00.000Z" },
    ],
  };
}

function plan(stop = 8): PositionRiskPlan {
  return {
    id: "plan-cde",
    ownerType: "PERSONAL",
    broker: "IBKR",
    accountKey: "U1",
    positionId: "pos-cde",
    instrumentKey: "IBKR:CDE:US",
    symbol: "CDE",
    name: "Coeur Mining",
    exchange: "US",
    currency: "USD",
    stopType: "TACTICAL",
    plannedStopPrice: stop,
    plannedTargetPrice: 16,
    rationale: null,
    invalidationNotes: null,
    sectorBenchmarkSymbol: "SILJ",
    reviewStatus: null,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
  };
}

function stopOrder(stopPrice = 8, quantity = 100): StoredOpenOrder {
  return {
    id: "order-stop",
    ownerType: "PERSONAL",
    broker: "IBKR",
    accountKey: "U1",
    orderId: "S1",
    conid: "1",
    symbol: "CDE",
    name: "Coeur Mining",
    exchange: "US",
    currency: "USD",
    side: "SELL",
    status: "Submitted",
    orderType: "STP",
    timeInForce: "GTC",
    totalQuantity: quantity,
    filledQuantity: 0,
    remainingQuantity: quantity,
    limitPrice: null,
    stopPrice,
    averagePrice: null,
    description: "",
    createdAt: null,
    updatedAt: freshBrokerOrderTimestamp,
    asOfDate: freshBrokerOrderDate,
    source: "test",
  };
}

function storage(input: { plans?: PositionRiskPlan[]; orders?: StoredOpenOrder[]; holdings?: Array<StoredPosition & { weight: number }> }): StorageAdapter {
  return {
    dashboard: async (scope: Scope) => dashboard(scope, input.holdings),
    listOpenOrders: async () => input.orders ?? [],
    listPositionRiskPlans: async () => input.plans ?? [],
    listPriceBook: async () => priceBook(),
    listRiskSnapshots: async () => [],
  } as unknown as StorageAdapter;
}

describe("buildStopsRiskDashboard", () => {
  it("calculates current stop risk and reward/risk from the recorded stop plan", async () => {
    const result = await buildStopsRiskDashboard(storage({ plans: [plan()], orders: [stopOrder()] }), "overall");
    assert.equal(result.rows.length, 1);
    assert.equal(result.summary.totalStopRiskAud, 300);
    assert.equal(result.rows[0]?.riskPercentNav, 3);
    assert.equal(result.rows[0]?.rewardRiskRatio, 3);
    assert.equal(result.rows[0]?.brokerStop.status, "PROTECTED");
    assert.deepEqual(result.rows[0]?.exceptions, []);
  });

  it("flags positions with no SouthernStar stop plan", async () => {
    const result = await buildStopsRiskDashboard(storage({ plans: [], orders: [] }), "overall");
    assert.equal(result.summary.positionsWithoutStops, 1);
    assert.equal(result.rows[0]?.exceptions[0]?.code, "NO_STOP_RECORDED");
  });

  it("flags broker stop price and quantity mismatches separately", async () => {
    const priceMismatch = await buildStopsRiskDashboard(storage({ plans: [plan()], orders: [stopOrder(7, 100)] }), "overall");
    assert.equal(priceMismatch.rows[0]?.brokerStop.status, "CHECK_BROKER");
    assert.equal(priceMismatch.rows[0]?.exceptions.some((exception) => exception.code === "BROKER_ORDER_MISMATCH"), true);

    const quantityMismatch = await buildStopsRiskDashboard(storage({ plans: [plan()], orders: [stopOrder(8, 50)] }), "overall");
    assert.equal(quantityMismatch.rows[0]?.brokerStop.status, "UNDER_STOPPED");
    assert.equal(quantityMismatch.rows[0]?.exceptions.some((exception) => exception.code === "STOP_QUANTITY_LT_POSITION"), true);
  });
});
