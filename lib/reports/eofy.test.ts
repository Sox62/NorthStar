import assert from "node:assert/strict";
import test from "node:test";
import { buildEofyReport } from "./eofy";
import type { DashboardData, DashboardHolding, PriceBook, StoredTransaction } from "@/lib/storage";

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

function holding(input: Partial<DashboardHolding> & Pick<DashboardHolding, "id" | "symbol" | "name" | "exchange" | "currency" | "quantity" | "costAud" | "marketValueAud">): DashboardHolding {
  return {
    ownerType: "PERSONAL",
    broker: "Directshares",
    accountKey: "4317403",
    instrumentKey: `Directshares:${input.symbol}:${input.exchange}`,
    assetClass: "Gold",
    lastPrice: null,
    averageCostAud: input.quantity ? input.costAud / input.quantity : 0,
    dayGainAud: 0,
    pnlAud: input.marketValueAud - input.costAud,
    pnlPercent: input.costAud ? (input.marketValueAud - input.costAud) / input.costAud * 100 : 0,
    valuationBasis: "market",
    asOfDate: "2026-07-18",
    source: "test",
    weight: 50,
    ...input,
  };
}

function dashboard(holdings: DashboardHolding[]): DashboardData {
  const totalValue = holdings.reduce((sum, row) => sum + row.marketValueAud, 0);
  return {
    scope: "personal",
    storageMode: "local-file",
    totalValue,
    investedValue: totalValue,
    cashValue: 0,
    dailyMovement: 0,
    totalReturn: holdings.reduce((sum, row) => sum + row.pnlAud, 0),
    totalReturnPercent: 0,
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
    currentValue: totalValue,
    lastUpdated: "2026-07-18",
  };
}

test("buildEofyReport values historical cost rows from EOFY price book", () => {
  const holdings = [
    holding({ id: "h-CMM", symbol: "CMM", name: "Capricorn Metals", exchange: "ASX", currency: "AUD", quantity: 100, costAud: 1000, marketValueAud: 2500 }),
    holding({ id: "h-SVM", symbol: "SVM", name: "Silvercorp", exchange: "TSX/TSXV", currency: "CAD", quantity: 50, costAud: 500, marketValueAud: 900 }),
  ];
  const priceBook: PriceBook = {
    instruments: [],
    prices: [
      {
        id: "p-CMM",
        instrumentId: "i-CMM",
        symbol: "CMM",
        exchange: "ASX",
        name: "Capricorn Metals",
        currency: "AUD",
        close: 20,
        priceDate: "2026-06-30",
        source: "test",
        retrievedAt: "2026-06-30T00:00:00.000Z",
      },
      {
        id: "p-SVM",
        instrumentId: "i-SVM",
        symbol: "SVM",
        exchange: "TSX/TSXV",
        name: "Silvercorp",
        currency: "CAD",
        close: 10,
        priceDate: "2026-06-30",
        source: "test",
        retrievedAt: "2026-06-30T00:00:00.000Z",
      },
    ],
    fxRates: [],
  };

  const report = buildEofyReport("personal", dashboard(holdings), [
    transaction({ id: "buy-CMM", externalId: "buy-CMM", tradeDate: "2026-01-10", symbol: "CMM", exchange: "ASX", type: "BUY", quantity: 100, cost: 1000, netCash: -1000 }),
    transaction({ id: "buy-SVM", externalId: "buy-SVM", tradeDate: "2026-01-10", symbol: "SVM", exchange: "TSX/TSXV", type: "BUY", quantity: 50, cost: 500, netCash: -500 }),
  ], 2026, new Date("2026-07-18T00:00:00.000Z"), priceBook);

  const cmm = report.historicalCost.find((row) => row.code === "CMM");
  const svm = report.historicalCost.find((row) => row.code === "SVM");

  assert.ok(cmm);
  assert.equal(cmm.closingValuationStatus, "exact");
  assert.equal(cmm.closingMarketValueAud, 2000);
  assert.equal(cmm.closingPriceDate, "2026-06-30");

  assert.ok(svm);
  assert.equal(svm.closingValuationStatus, "missing_fx");
  assert.equal(svm.closingMarketValueAud, null);
  assert.equal(svm.closingPrice, 10);
  assert.ok(report.dataQuality.some((note) => note.includes("price or FX backfill")));
});
