import assert from "node:assert/strict";
import test from "node:test";
import { buildEofyReport, eofyReportCsv } from "./eofy";
import { eofyReportXlsx } from "./eofy-xlsx";
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
  const priceBook: PriceBook = {
    instruments: [],
    prices: ["CMM", "NST", "LOS"].map((symbol) => ({
      id: `p-${symbol}`,
      instrumentId: `i-${symbol}`,
      symbol,
      exchange: "ASX",
      name: symbol,
      currency: "AUD",
      close: 10,
      priceDate: "2026-06-30",
      source: "test",
      retrievedAt: "2026-06-30T00:00:00.000Z",
    })),
    fxRates: [],
  };
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
  ], 2026, new Date("2026-07-18T00:00:00.000Z"), priceBook);

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
  assert.equal(report.reconciliation.status, "ok");
  assert.equal(report.reconciliation.rows.find((row) => row.check === "Realised proceeds subtotal")?.varianceAud, 0);
  assert.equal(report.reconciliation.rows.find((row) => row.check === "Realised cost base subtotal")?.varianceAud, 0);
  assert.equal(report.reconciliation.rows.find((row) => row.check === "Taxable net capital gain")?.varianceAud, 0);

  const csv = eofyReportCsv(report);
  assert.match(csv, /accountant_reconciliation,Personal,FY2026,Realised proceeds subtotal,CGT/);
  assert.match(csv, /sharesight_cgt_summary,Personal,FY2026,Total net capital gain \(18A\)/);
  assert.match(csv, /realised_cgt_lot,Personal,FY2026,Capricorn Metals,CMM,Directshares,2026-01-10/);
  assert.match(csv, /discount 50%/);
  const xlsx = eofyReportXlsx(report);
  assert.ok(xlsx.includes(Buffer.from("Reconciliation")));
  assert.ok(xlsx.includes(Buffer.from("Capital gains or losses")));
  assert.ok(xlsx.includes(Buffer.from("Taxable Income Report")));
  assert.ok(xlsx.includes(Buffer.from("Unrealised CGT Report")));
});

test("buildEofyReport keeps multiple personal Directshares accounts in the account summary", () => {
  const report = buildEofyReport("personal", dashboard([
    holding({ id: "h-CMM-4317403", symbol: "CMM", name: "Capricorn Metals", exchange: "ASX", currency: "AUD", quantity: 60, costAud: 600, marketValueAud: 900, accountKey: "4317403" }),
    holding({ id: "h-ASL-4386162", symbol: "ASL", name: "Andean Silver", exchange: "ASX", currency: "AUD", quantity: 1000, costAud: 2000, marketValueAud: 2500, accountKey: "4386162" }),
  ]), [
    transaction({
      id: "buy-CMM-4317403",
      externalId: "buy-CMM-4317403",
      accountKey: "4317403",
      tradeDate: "2025-07-10",
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
      id: "sell-CMM-4317403",
      externalId: "sell-CMM-4317403",
      accountKey: "4317403",
      tradeDate: "2026-02-10",
      symbol: "CMM",
      exchange: "ASX",
      description: "Capricorn Metals",
      instrumentKey: "Directshares:CMM:ASX",
      type: "SELL",
      quantity: -40,
      cost: -500,
      netCash: 700,
    }),
    transaction({
      id: "buy-ASL-4386162",
      externalId: "buy-ASL-4386162",
      accountKey: "4386162",
      tradeDate: "2025-08-01",
      symbol: "ASL",
      exchange: "ASX",
      description: "Andean Silver",
      instrumentKey: "Directshares:ASL:ASX",
      type: "BUY",
      quantity: 1000,
      cost: 2000,
      netCash: -2000,
    }),
    transaction({
      id: "div-ASL-4386162",
      externalId: "div-ASL-4386162",
      accountKey: "4386162",
      tradeDate: "2026-03-01",
      symbol: "ASL",
      exchange: "ASX",
      description: "Andean Silver dividend",
      instrumentKey: "Directshares:ASL:ASX",
      type: "DIVIDEND",
      quantity: 0,
      cost: 0,
      netCash: 100,
      raw: { grossDividend: 100 },
    }),
  ], 2026, new Date("2026-07-18T00:00:00.000Z"));

  assert.deepEqual(report.accountSummaries.map((row) => row.accountKey), ["4317403", "4386162"]);
  assert.equal(report.accountSummaries.find((row) => row.accountKey === "4317403")?.sellTrades, 1);
  assert.equal(report.accountSummaries.find((row) => row.accountKey === "4386162")?.incomePayments, 1);
  assert.match(eofyReportCsv(report), /account_summary,Personal,FY2026,Directshares account 4386162/);
  assert.ok(eofyReportXlsx(report).includes(Buffer.from("Account Summary")));
});
