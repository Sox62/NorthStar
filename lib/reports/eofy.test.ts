import assert from "node:assert/strict";
import test from "node:test";
import { buildEofyReport, eofyReportCsv } from "./eofy";
import { capitalGainsReport, eofyPricedOpenLots } from "./eofy/cgt";
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
    currentValue: totalValue,
    lastUpdated: "2026-07-18",
  };
}

test("buildEofyReport declares its Australian tax jurisdiction", () => {
  const report = buildEofyReport("personal", dashboard([]), [], 2026, new Date("2026-07-18T00:00:00.000Z"));
  assert.equal(report.taxJurisdictionCode, "AU");
  assert.equal(report.taxJurisdiction.label, "Australia");
  assert.equal(report.taxJurisdiction.taxCurrency, "AUD");
  assert.equal(report.taxJurisdiction.taxYearBasis, "australian_financial_year");
});


function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  return cells;
}

test("eofyReportCsv carries tax jurisdiction metadata without shifting columns", () => {
  const report = buildEofyReport("personal", dashboard([]), [], 2026, new Date("2026-07-18T00:00:00.000Z"));
  const rows = eofyReportCsv(report).split("\n").map(parseCsvLine);
  const header = rows[0];
  assert.equal(header.includes("tax_jurisdiction"), true);
  assert.equal(header.includes("tax_currency"), true);
  assert.equal(rows[1][header.indexOf("tax_jurisdiction")], "AU");
  assert.equal(rows[1][header.indexOf("tax_currency")], "AUD");
  assert.equal(rows.every((row) => row.length === header.length), true);
});

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
  assert.match(csv, /accountant_reconciliation,Personal,AU,AUD,FY2026,Realised proceeds subtotal,CGT/);
  assert.match(csv, /sharesight_cgt_summary,Personal,AU,AUD,FY2026,Total net capital gain \(18A\)/);
  assert.match(csv, /realised_cgt_lot,Personal,AU,AUD,FY2026,Capricorn Metals,CMM,Directshares,2026-01-10/);
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
  assert.match(eofyReportCsv(report), /account_summary,Personal,AU,AUD,FY2026,Directshares account 4386162/);
  assert.ok(eofyReportXlsx(report).includes(Buffer.from("Account Summary")));
});

test("repricing an open lot to year end does not undo a pension-phase exemption", () => {
  // eofyPricedOpenLots recomputes the taxable figure because repricing changes the gain. It used to
  // recompute it from the lot's own discount fields with no treatment in scope, which overwrote an
  // exempt zero with a taxable number on every SMSF lot it touched.
  const lot = {
    id: "h1:fallback", ownerType: "SMSF" as const, ownerLabel: "SMSF", broker: "IBKR",
    accountKey: "U2....088", symbol: "CDE", name: "Coeur Mining", exchange: "NYSE",
    acquisitionDate: "2026-05-28", asOfDate: "2026-06-30", heldDays: 33,
    discountEligible: false, discountRate: 1 / 3, quantity: 2400, costAud: 35376,
    marketValueAud: 70882, unrealisedGainAud: 35506, unrealisedGainPercent: 100.4,
    taxableGainIfSoldAud: 0, source: "position_fallback", note: "",
  };

  const exempt = eofyPricedOpenLots([lot as never], [], "2026-06-30", { pensionPhase: true });
  assert.equal(exempt[0].taxableGainIfSoldAud, 0, "an exempt lot stays exempt after repricing");

  const taxed = eofyPricedOpenLots([lot as never], [], "2026-06-30", { pensionPhase: false });
  assert.equal(taxed[0].taxableGainIfSoldAud, 0, "with no valuation row the lot is passed through untouched");
});

test("a pension-phase net capital gain is nil however the parcels net off", () => {
  const gain = (symbol: string, realisedGainAud: number, discountEligible: boolean) => ({
    id: symbol, ownerType: "SMSF" as const, ownerLabel: "SMSF", broker: "IBKR", accountKey: "U2....088",
    symbol, name: symbol, exchange: "NYSE", acquisitionDate: "2025-06-01", saleDate: "2026-05-01",
    heldDays: 334, discountEligible, discountRate: 1 / 3, quantity: 100, proceedsAud: 0,
    costAud: 0, realisedGainAud, taxableGainAud: 0, note: "",
  });

  const exempt = capitalGainsReport("personal", [gain("A", 20000, true), gain("B", -5000, false)] as never, { pensionPhase: true });
  assert.equal(exempt.summary.netCapitalGainAud, 0);

  // The same parcels in an accumulation book still produce a real figure, so the exemption is the
  // only thing being tested here, not a zeroed report.
  const taxed = capitalGainsReport("personal", [gain("A", 20000, true), gain("B", -5000, false)] as never, { pensionPhase: false });
  assert.ok(taxed.summary.netCapitalGainAud > 0, "accumulation still taxes it");
  assert.equal(taxed.summary.discountRate, 0.5, "an individual's rate, from the engine");
});

test("a disposal with no reconstructable cost base still appears in the report", () => {
  // Its gain is exactly zero, and the three buckets ask for > 0, > 0 and < 0 — so it fell through
  // all of them and vanished. Twenty-six disposals were missing this way.
  const lot = {
    id: "x", ownerType: "PERSONAL" as const, ownerLabel: "Personal", broker: "Directshares",
    accountKey: "43....403", symbol: "BOE", name: "Boss Energy", exchange: "ASX",
    acquisitionDate: null, saleDate: "2025-09-23", heldDays: null, discountEligible: false,
    discountRate: 0.5, quantity: 6363, proceedsAud: 13028.28, costAud: 13028.28,
    realisedGainAud: 0, taxableGainAud: 0, note: "Acquisition lot missing",
  };
  const report = capitalGainsReport("personal", [lot as never], { pensionPhase: false });
  assert.equal(report.shortTerm.length, 1, "the disposal is visible");
  assert.equal(report.summary.shortTermGainsAud, 0, "and contributes nothing to the totals");
  assert.equal(report.byHolding.find((row) => row.code === "BOE")?.soldQuantity, 6363);
});

test("every schedule in the pack counts a trade the same number of times", () => {
  /*
   * One trade carried by two exports became four trade movements, $570 of sale proceeds against
   * $285 of canonical disposals, and a doubled historical purchase — while the CGT beside them
   * correctly counted one. The schedules read raw rows; only the CGT saw the de-duplicated set.
   */
  const base = (over: Record<string, unknown>) => ({
    ownerType: "PERSONAL", broker: "IBKR", accountKey: "U1", symbol: "T", exchange: "ARCA",
    instrumentKey: "T:ARCA", currency: "AUD", fxRateToBase: 1, fees: 0, ...over,
  });
  const rows = [
    base({ id: "a1", externalId: "a1", source: "IBKR Flex", tradeDate: "2025-08-01", type: "BUY", quantity: 1, cost: 165 }),
    base({ id: "a2", externalId: "a2", source: "IBKR Trade Confirmation Flex", tradeDate: "2025-08-01", type: "BUY", quantity: 1, cost: 165 }),
    base({ id: "s1", externalId: "s1", source: "IBKR Flex", tradeDate: "2025-10-01", type: "SELL", quantity: 1, cost: 285, netCash: 285 }),
    base({ id: "s2", externalId: "s2", source: "IBKR Trade Confirmation Flex", tradeDate: "2025-10-01", type: "SELL", quantity: 1, cost: 285, netCash: 285 }),
  ];
  const report = buildEofyReport("personal", dashboard([]), rows as never, 2026, new Date("2026-06-30T00:00:00.000Z"));
  assert.equal(report.realisedLots.length, 1, "one disposal");
  assert.equal(report.tradeMovements.length, 2, "one buy and one sell, not four rows");
  assert.equal(report.summary.sellsAud, 285);
  assert.equal(report.summary.buysAud, 165);
  assert.equal(report.historicalCost[0].purchasesAud, 165);
});

test("the historical schedule consumes the parcel the election chose", () => {
  // A cost-of-sales figure that took a different parcel from the disposal printed beside it is not
  // a second opinion, it is a contradiction. Under LIFO this read $100 against the CGT's $200.
  const base = (over: Record<string, unknown>) => ({
    ownerType: "PERSONAL", broker: "X", accountKey: "A", symbol: "T", exchange: "US",
    instrumentKey: "T:US", currency: "AUD", fxRateToBase: 1, fees: 0, source: "S", ...over,
  });
  const rows = [
    base({ id: "b1", externalId: "b1", tradeDate: "2025-08-01", type: "BUY", quantity: 1, cost: 100 }),
    base({ id: "b2", externalId: "b2", tradeDate: "2025-09-01", type: "BUY", quantity: 1, cost: 200 }),
    base({ id: "s", externalId: "s", tradeDate: "2025-10-01", type: "SELL", quantity: 1, cost: 300, netCash: 300 }),
  ];
  const report = buildEofyReport(
    "personal", dashboard([]), rows as never, 2026, new Date("2026-06-30T00:00:00.000Z"),
    undefined, { pensionPhase: false }, { method: "lifo" },
  );
  const cgtCost = report.realisedLots.reduce((sum, lot) => sum + lot.costAud, 0);
  assert.equal(cgtCost, 200);
  assert.equal(report.historicalCost[0].costOfSalesAud, 200, "same parcel as the CGT");
  assert.match(report.historicalCost[0].allocationMethod, /Last in, first out/);
});

test("the historical schedule pools a holding across the accounts an export names", () => {
  /*
   * Keying on the account split BOE into three schedule rows closing at 56,837 units between them,
   * against a real holding of none — the account says which export carried a row, not which
   * holding it belongs to.
   */
  const base = (over: Record<string, unknown>) => ({
    ownerType: "PERSONAL", broker: "Directshares", symbol: "BOE", exchange: "ASX",
    instrumentKey: "Directshares:BOE:ASX", currency: "AUD", fxRateToBase: 1, fees: 0, source: "S", ...over,
  });
  const rows = [
    base({ id: "b", externalId: "b", accountKey: "4317403", tradeDate: "2025-08-01", type: "BUY", quantity: 100, cost: 1000 }),
    base({ id: "s", externalId: "s", accountKey: "DIRECTSHARES", tradeDate: "2025-10-01", type: "SELL", quantity: 100, cost: 1500, netCash: 1500 }),
  ];
  const report = buildEofyReport("personal", dashboard([]), rows as never, 2026, new Date("2026-06-30T00:00:00.000Z"));
  assert.equal(report.historicalCost.length, 1, "one holding, one row");
  assert.equal(report.historicalCost[0].costOfSalesAud, 1000, "the sale reaches the buy filed under the other account");
  assert.equal(report.historicalCost[0].closingQuantity, 0);
});

test("the historical schedule applies a consolidation", () => {
  // Skipped, it reported PDN at a tenth of its real unit cost and BOE at an eighth.
  const base = (over: Record<string, unknown>) => ({
    ownerType: "PERSONAL", broker: "Directshares", accountKey: "A", symbol: "PDN", exchange: "ASX",
    instrumentKey: "Directshares:PDN:ASX", currency: "AUD", fxRateToBase: 1, fees: 0,
    source: "Directshares All Trades Report", ...over,
  });
  const rows = [
    base({ id: "b", externalId: "b", tradeDate: "2025-08-01", type: "BUY", quantity: 1000, cost: 300 }),
    base({
      id: "c", externalId: "c", tradeDate: "2025-09-01", type: "CORPORATE_ACTION", quantity: -900,
      description: "Consolidation", raw: { actionQuantityBefore: 1000, actionQuantityAfter: 100 },
    }),
    base({ id: "s", externalId: "s", tradeDate: "2025-10-01", type: "SELL", quantity: 50, cost: 400, netCash: 400 }),
  ];
  const row = buildEofyReport("personal", dashboard([]), rows as never, 2026, new Date("2026-06-30T00:00:00.000Z")).historicalCost[0];
  assert.equal(row.closingQuantity, 50, "1,000 consolidated to 100, then 50 sold");
  // $300 over 100 units is $3.00 each, not the pre-consolidation $0.30.
  assert.equal(row.costOfSalesAud.toFixed(2), "150.00");
  assert.equal(row.closingBalanceAud.toFixed(2), "150.00");
});

test("year-end open lots come from what was held at year end", () => {
  /*
   * The schedule took its quantities from current holdings, so a position sold after 30 June
   * reported the year-end value of two units spread across the one still held, and a holding sold
   * out entirely vanished from a schedule whose purpose is to show what was owned on 30 June.
   */
  const base = (over: Record<string, unknown>) => ({
    ownerType: "PERSONAL", broker: "Directshares", accountKey: "A", symbol: "T", exchange: "ASX",
    instrumentKey: "Directshares:T:ASX", currency: "AUD", fxRateToBase: 1, fees: 0, source: "S", ...over,
  });
  const rows = [
    base({ id: "b", externalId: "b", tradeDate: "2025-08-01", type: "BUY", quantity: 2, cost: 200 }),
    // Sold in August 2026 — the next financial year, after the 30 June cut-off.
    base({ id: "s", externalId: "s", tradeDate: "2026-08-01", type: "SELL", quantity: 1, cost: 150, netCash: 150 }),
  ];
  const report = buildEofyReport("personal", dashboard([
    holding({ id: "h", symbol: "T", name: "T", exchange: "ASX", currency: "AUD", quantity: 1, costAud: 100, marketValueAud: 150 }),
  ]), rows as never, 2026, new Date("2026-10-15T00:00:00.000Z"));

  assert.equal(report.historicalCost[0].closingQuantity, 2, "two units were held on 30 June");
  const open = [...report.unrealisedCgt.shortTerm, ...report.unrealisedCgt.longTerm];
  assert.equal(open.reduce((sum, lot) => sum + lot.quantity, 0), 2, "the open schedule agrees, rather than reading today's one");
  assert.equal(open.reduce((sum, lot) => sum + lot.costAud, 0).toFixed(2), "200.00");
});

test("a holding sold out after year end is still in the year-end schedule", () => {
  const base = (over: Record<string, unknown>) => ({
    ownerType: "PERSONAL", broker: "Directshares", accountKey: "A", symbol: "Z", exchange: "ASX",
    instrumentKey: "Directshares:Z:ASX", currency: "AUD", fxRateToBase: 1, fees: 0, source: "S", ...over,
  });
  const rows = [
    base({ id: "b", externalId: "b", tradeDate: "2025-08-01", type: "BUY", quantity: 10, cost: 1000 }),
    base({ id: "s", externalId: "s", tradeDate: "2026-09-01", type: "SELL", quantity: 10, cost: 1500, netCash: 1500 }),
  ];
  // Nothing is held now, so the old path had nothing to scale and dropped the holding entirely.
  const report = buildEofyReport("personal", dashboard([]), rows as never, 2026, new Date("2026-10-15T00:00:00.000Z"));
  const open = [...report.unrealisedCgt.shortTerm, ...report.unrealisedCgt.longTerm];
  assert.equal(open.reduce((sum, lot) => sum + lot.quantity, 0), 10, "ten units were held on 30 June");
});

test("fees are converted by the currency the source states, not the trade's", () => {
  /*
   * A Directshares export states brokerage in AUD however the trade was priced; IBKR states its
   * commission in the currency charged. Converting both by the trade's rate inflated $129 of
   * Directshares brokerage to $196 on a USD trade; converting neither understated IBKR's by the
   * same factor.
   */
  const row = (over: Record<string, unknown>) => ({
    ownerType: "PERSONAL", broker: "X", accountKey: "A", symbol: "T", exchange: "US",
    instrumentKey: "T:US", currency: "USD", fxRateToBase: 1.5, ...over,
  });
  const directshares = [
    row({ id: "b", externalId: "b", source: "Directshares All Trades Report", tradeDate: "2025-08-01", type: "BUY", quantity: 1, cost: 100, fees: 10 }),
    row({ id: "s", externalId: "s", source: "Directshares All Trades Report", tradeDate: "2025-10-01", type: "SELL", quantity: 1, cost: 200, netCash: 200 }),
  ];
  const dsReport = buildEofyReport("personal", dashboard([]), directshares as never, 2026, new Date("2026-06-30T00:00:00.000Z"));
  // USD100 x 1.5 = AUD150, plus AUD10 of brokerage stated in AUD.
  assert.equal(dsReport.realisedLots[0].costAud, 160);
  assert.equal(dsReport.tradeMovements.find((t) => t.type === "BUY")!.feesAud, 10, "not 15");

  const ibkr = [
    row({ id: "b", externalId: "b", source: "IBKR Flex", tradeDate: "2025-08-01", type: "BUY", quantity: 1, cost: 100, fees: 10, raw: { feeCurrency: "USD" } }),
    row({ id: "s", externalId: "s", source: "IBKR Flex", tradeDate: "2025-10-01", type: "SELL", quantity: 1, cost: 200, netCash: 200 }),
  ];
  const ibkrReport = buildEofyReport("personal", dashboard([]), ibkr as never, 2026, new Date("2026-06-30T00:00:00.000Z"));
  // USD100 x 1.5 = AUD150, plus USD10 of commission at the same rate = AUD15.
  assert.equal(ibkrReport.realisedLots[0].costAud, 165);
  assert.equal(ibkrReport.tradeMovements.find((t) => t.type === "BUY")!.feesAud, 15);
});

test("a foreign trade with no rate is reported, not quietly valued at parity", () => {
  const row = (over: Record<string, unknown>) => ({
    ownerType: "PERSONAL", broker: "IBKR", accountKey: "U1", symbol: "T", exchange: "ARCA",
    instrumentKey: "T:ARCA", currency: "USD", fxRateToBase: null, fees: 0, source: "IBKR Flex", ...over,
  });
  const rows = [
    row({ id: "b", externalId: "b", tradeDate: "2025-08-01", type: "BUY", quantity: 1, cost: 100 }),
    row({ id: "s", externalId: "s", tradeDate: "2025-10-01", type: "SELL", quantity: 1, cost: 200, netCash: 200 }),
  ];
  const report = buildEofyReport("personal", dashboard([]), rows as never, 2026, new Date("2026-06-30T00:00:00.000Z"));
  const note = report.dataQuality.find((entry) => /no exchange rate/.test(entry));
  assert.ok(note, "the assumption has to be stated");
  assert.match(note!, /assumed at parity rather than measured/);
  assert.match(note!, /USD/);
});
