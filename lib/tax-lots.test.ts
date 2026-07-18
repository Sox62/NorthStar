import assert from "node:assert/strict";
import test from "node:test";
import { buildTaxLots } from "./tax-lots";
import type { DashboardData, DashboardHolding, StoredTransaction } from "./storage";

function transaction(input: Partial<StoredTransaction> & Pick<StoredTransaction, "id" | "externalId" | "tradeDate" | "symbol" | "exchange" | "type" | "quantity" | "cost" | "netCash">): StoredTransaction {
  return {
    ownerType: "PERSONAL",
    broker: "Directshares",
    accountKey: "4317403",
    currency: "AUD",
    fxRateToBase: 1,
    source: "test",
    ...input,
  };
}

function holding(input: Partial<DashboardHolding>): DashboardHolding {
  return {
    id: "holding-CMM",
    ownerType: "PERSONAL",
    broker: "Directshares",
    accountKey: "4317403",
    instrumentKey: "Directshares:CMM:ASX",
    symbol: "CMM",
    name: "Capricorn Metals",
    exchange: "ASX",
    currency: "AUD",
    assetClass: "Gold",
    quantity: 60,
    lastPrice: 20,
    averageCostAud: 10,
    costAud: 600,
    marketValueAud: 1200,
    dayGainAud: 0,
    pnlAud: 600,
    pnlPercent: 100,
    valuationBasis: "market",
    asOfDate: "2026-06-30",
    source: "test",
    weight: 100,
    ...input,
  };
}

function dashboard(holdings: DashboardHolding[]): DashboardData {
  return {
    scope: "personal",
    storageMode: "local-file",
    totalValue: 1200,
    investedValue: 1200,
    cashValue: 0,
    dailyMovement: 0,
    totalReturn: 600,
    totalReturnPercent: 100,
    holdings,
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
    currentValue: 1200,
    lastUpdated: "2026-06-30",
  };
}

test("buildTaxLots applies FIFO realised and open lots", () => {
  const report = buildTaxLots(dashboard([holding({})]), [
    transaction({
      id: "buy-1",
      externalId: "buy-1",
      tradeDate: "2024-01-01",
      symbol: "CMM",
      exchange: "ASX",
      description: "Capricorn Metals",
      instrumentKey: "Directshares:CMM:ASX",
      type: "BUY",
      quantity: 100,
      cost: 1000,
      netCash: -1000,
    }),
    transaction({
      id: "sell-1",
      externalId: "sell-1",
      tradeDate: "2026-06-01",
      symbol: "CMM",
      exchange: "ASX",
      description: "Capricorn Metals",
      instrumentKey: "Directshares:CMM:ASX",
      type: "SELL",
      quantity: -40,
      cost: -600,
      netCash: 600,
    }),
  ], new Date("2026-06-30T00:00:00.000Z"));

  assert.equal(report.realisedLots.length, 1);
  assert.equal(report.realisedLots[0].quantity, 40);
  assert.equal(report.realisedLots[0].costAud, 400);
  assert.equal(report.realisedLots[0].proceedsAud, 600);
  assert.equal(report.realisedLots[0].realisedGainAud, 200);
  assert.equal(report.realisedLots[0].discountEligible, true);
  assert.equal(report.realisedLots[0].taxableGainAud, 100);

  assert.equal(report.openLots.length, 1);
  assert.equal(report.openLots[0].quantity, 60);
  assert.equal(report.openLots[0].costAud, 600);
  assert.equal(report.openLots[0].marketValueAud, 1200);
  assert.equal(report.openLots[0].taxableGainIfSoldAud, 300);
});
