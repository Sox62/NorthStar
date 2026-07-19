import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardModel, buildManualAssetValuation, buildPositionPriceValuation } from "./accounting";
import type { CashAccount, ManualAsset, StoredPosition, StoredTransaction, SyncRun } from "@/lib/storage/types";

function position(input: Partial<StoredPosition>): StoredPosition {
  return {
    id: "position-1",
    ownerType: "PERSONAL",
    broker: "Directshares",
    accountKey: "4317403",
    instrumentKey: "Directshares:CMM:ASX",
    symbol: "CMM",
    name: "Capricorn Metals",
    exchange: "ASX",
    currency: "AUD",
    assetClass: "Gold miners",
    quantity: 100,
    lastPrice: 15,
    averageCostAud: 10,
    costAud: 1000,
    marketValueAud: 1500,
    dayGainAud: 25,
    pnlAud: 500,
    pnlPercent: 50,
    valuationBasis: "market",
    asOfDate: "2026-07-17",
    source: "test",
    ...input,
  };
}

function cash(input: Partial<CashAccount>): CashAccount {
  return {
    id: "cash-1",
    ownerType: "PERSONAL",
    institution: "Macquarie",
    name: "Cash",
    currency: "AUD",
    balance: 500,
    balanceAud: 500,
    fxRateToAud: 1,
    asOfDate: "2026-07-17",
    updatedAt: "2026-07-17T09:00:00.000Z",
    ...input,
  };
}

function manualAsset(input: Partial<ManualAsset>): ManualAsset {
  return {
    id: "metal-1",
    ownerType: "PERSONAL",
    assetType: "PLATINUM",
    name: "Physical platinum",
    quantityKg: 1,
    totalCostAud: 1500,
    costAudPerKg: 1500,
    buybackAudPerKg: 2000,
    retailAudPerKg: 2200,
    marketValueAud: 2000,
    pnlAud: 500,
    pnlPercent: 33.33333333333333,
    dealerSpreadAudPerKg: 200,
    dealerSpreadPercent: 9.090909090909092,
    priceProvider: "ABC Bullion",
    priceSourceUrl: "https://example.test/platinum",
    purchaseDate: "2025-01-01",
    asOfDate: "2026-07-17",
    priceRetrievedAt: "2026-07-17T08:00:00.000Z",
    updatedAt: "2026-07-17T08:00:00.000Z",
    ...input,
  };
}

function transaction(input: Partial<StoredTransaction>): StoredTransaction {
  return {
    id: "txn-1",
    ownerType: "PERSONAL",
    broker: "Directshares",
    accountKey: "4317403",
    externalId: "sell-1",
    externalAccountId: "4317403",
    tradeDate: "2026-06-01",
    symbol: "CMM",
    exchange: "ASX",
    type: "SELL",
    quantity: 10,
    cost: 250,
    currency: "AUD",
    fxRateToBase: 1,
    realisedPnl: 100,
    source: "test",
    ...input,
  };
}

function syncRun(input: Partial<SyncRun>): SyncRun {
  return {
    id: "sync-1",
    source: "Directshares Email",
    ownerType: "PERSONAL",
    trigger: "manual",
    status: "success",
    startedAt: "2026-07-17T10:00:00.000Z",
    finishedAt: "2026-07-17T10:00:10.000Z",
    durationMs: 10000,
    recordCount: 1,
    positionCount: 1,
    cashAud: null,
    message: "ok",
    error: null,
    ...input,
  };
}

test("buildManualAssetValuation calculates metal value, P/L and dealer spread", () => {
  const valuation = buildManualAssetValuation({
    quantityKg: 2,
    totalCostAud: 3000,
    buybackAudPerKg: 1750,
    retailAudPerKg: 1900,
  });

  assert.equal(valuation.marketValueAud, 3500);
  assert.equal(valuation.pnlAud, 500);
  assert.equal(valuation.pnlPercent, 16.666666666666664);
  assert.equal(valuation.dealerSpreadAudPerKg, 150);
  assert.equal(valuation.dealerSpreadPercent, 7.894736842105263);
});

test("buildPositionPriceValuation uses previous close for daily P/L", () => {
  const valuation = buildPositionPriceValuation({
    quantity: 100,
    close: 12,
    fxRateToAud: 1.5,
    costAud: 1000,
    previousClose: 10,
    previousMarketValueAud: 1400,
  });

  assert.equal(valuation.marketValueAud, 1800);
  assert.equal(valuation.dayGainAud, 300);
  assert.equal(valuation.pnlAud, 800);
  assert.equal(valuation.pnlPercent, 80);
});

test("buildDashboardModel scopes legal owners and centralises dashboard accounting", () => {
  const dashboard = buildDashboardModel({
    scope: "personal",
    storageMode: "local-file",
    positions: [
      position({}),
      position({ id: "smsf-position", ownerType: "SMSF", marketValueAud: 9000, costAud: 8000, pnlAud: 1000 }),
    ],
    manualAssets: [
      manualAsset({}),
      manualAsset({ id: "smsf-metal", ownerType: "SMSF", marketValueAud: 7000 }),
    ],
    cashAccounts: [
      cash({}),
      cash({ id: "smsf-cash", ownerType: "SMSF", balanceAud: 3000 }),
    ],
    transactions: [
      transaction({}),
      transaction({ id: "smsf-sell", ownerType: "SMSF", realisedPnl: 4000 }),
    ],
    imports: [
      { source: "Directshares", ownerType: "PERSONAL", importedAt: "2026-07-17T09:30:00.000Z", recordCount: 2, accountKey: "4317403" },
      { source: "IBKR", ownerType: "SMSF", importedAt: "2026-07-17T09:35:00.000Z", recordCount: 9, accountKey: "SMSF123" },
    ],
    snapshots: [
      { ownerType: "PERSONAL", capturedAt: "2026-07-16T10:00:00.000Z", marketValue: 3000, cashValue: 400 },
      { ownerType: "PERSONAL", capturedAt: "2026-07-17T10:00:00.000Z", marketValue: 3500, cashValue: 500 },
      { ownerType: "SMSF", capturedAt: "2026-07-17T10:00:00.000Z", marketValue: 20000, cashValue: 3000 },
    ],
    syncRuns: [
      syncRun({}),
      syncRun({ id: "smsf-sync", ownerType: "SMSF", finishedAt: "2026-07-17T11:00:00.000Z" }),
    ],
    allocationTargets: [],
  });

  assert.equal(dashboard.totalValue, 4000);
  assert.equal(dashboard.investedValue, 3500);
  assert.equal(dashboard.cashValue, 500);
  assert.equal(dashboard.dailyMovement, 25);
  assert.equal(dashboard.totalReturn, 1100);
  assert.equal(dashboard.totalReturnPercent, 44);
  assert.deepEqual(dashboard.performance.map((point) => point.overall), [3400, 4000]);
  assert.equal(dashboard.periodReturns[0].valueAud, 600);
  assert.equal(dashboard.holdings.length, 2);
  assert.equal(dashboard.accounts.length, 3);
  assert.equal(dashboard.syncRuns.length, 1);
  assert.equal(dashboard.allocations[0].name, "Physical platinum");
  assert.equal(dashboard.currencyExposure[0].currency, "AUD");
});
