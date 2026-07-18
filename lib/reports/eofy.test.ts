import assert from "node:assert/strict";
import test from "node:test";
import { buildEofyReport, eofyReportCsv } from "./eofy";
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

test("buildEofyReport calculates realised CGT after loss offset and discount", () => {
  const report = buildEofyReport("personal", dashboard([]), [
    transaction({
      id: "buy-long",
      externalId: "buy-long",
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
      id: "sell-long",
      externalId: "sell-long",
      tradeDate: "2026-01-10",
      symbol: "CMM",
      exchange: "ASX",
      description: "Capricorn Metals",
      instrumentKey: "Directshares:CMM:ASX",
      type: "SELL",
      quantity: -40,
      cost: -1000,
      netCash: 1000,
    }),
    transaction({
      id: "buy-short",
      externalId: "buy-short",
      tradeDate: "2026-02-01",
      symbol: "NST",
      exchange: "ASX",
      description: "Northern Star",
      instrumentKey: "Directshares:NST:ASX",
      type: "BUY",
      quantity: 100,
      cost: 1000,
      netCash: -1000,
    }),
    transaction({
      id: "sell-short",
      externalId: "sell-short",
      tradeDate: "2026-06-01",
      symbol: "NST",
      exchange: "ASX",
      description: "Northern Star",
      instrumentKey: "Directshares:NST:ASX",
      type: "SELL",
      quantity: -50,
      cost: -700,
      netCash: 700,
    }),
    transaction({
      id: "buy-loss",
      externalId: "buy-loss",
      tradeDate: "2026-03-01",
      symbol: "LOS",
      exchange: "ASX",
      description: "Loss Example",
      instrumentKey: "Directshares:LOS:ASX",
      type: "BUY",
      quantity: 100,
      cost: 1000,
      netCash: -1000,
    }),
    transaction({
      id: "sell-loss",
      externalId: "sell-loss",
      tradeDate: "2026-06-15",
      symbol: "LOS",
      exchange: "ASX",
      description: "Loss Example",
      instrumentKey: "Directshares:LOS:ASX",
      type: "SELL",
      quantity: -100,
      cost: -600,
      netCash: 600,
    }),
  ], 2026, new Date("2026-07-18T00:00:00.000Z"));

  assert.equal(report.capitalGains.summary.shortTermGainsAud, 200);
  assert.equal(report.capitalGains.summary.longTermGainsAud, 600);
  assert.equal(report.capitalGains.summary.lossesAud, -400);
  assert.equal(report.capitalGains.summary.shortTermGainsAfterLossesAud, 0);
  assert.equal(report.capitalGains.summary.longTermGainsAfterLossesAud, 400);
  assert.equal(report.capitalGains.summary.cgtConcessionAud, 200);
  assert.equal(report.capitalGains.summary.netCapitalGainAud, 200);
  assert.equal(report.summary.taxableRealisedAud, 200);
  assert.equal(report.capitalGains.shortTerm.length, 1);
  assert.equal(report.capitalGains.longTerm.length, 1);
  assert.equal(report.capitalGains.losses.length, 1);

  const csv = eofyReportCsv(report);
  assert.match(csv, /sharesight_cgt_summary,Personal,FY2026,Total net capital gain \(18A\)/);
  assert.match(csv, /realised_cgt_lot,Personal,FY2026,Capricorn Metals,CMM,Directshares,2026-01-10/);
  assert.match(csv, /discount 50%/);
});
