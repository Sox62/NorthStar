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

test("a position is dated even when its trades spell the instrument key differently", () => {
  // Production stores a Directshares position as "ASL:ASX" while the imported trade carries
  // "Directshares:ASL:ASX", and the accounts differ too: the holdings export names a real account
  // number, the All Trades Report names nobody. Keyed strictly, 123 imported trades sat in storage
  // while every one of those positions still reported "no trade history".
  const holding = {
    id: "h1", ownerType: "PERSONAL", broker: "Directshares", accountKey: "4317403",
    instrumentKey: "ASL:ASX", symbol: "ASL", name: "Andean Silver", exchange: "ASX", currency: "AUD",
    assetClass: "EQUITY", quantity: 23486, lastPrice: 1.6, averageCostAud: 1.45, costAud: 34055,
    marketValueAud: 37578, dayGainAud: 0, pnlAud: 3523, pnlPercent: 10.3,
    valuationBasis: "market", asOfDate: "2026-08-20", source: "Directshares", weight: 1,
  };
  const trade = {
    id: "t1", ownerType: "PERSONAL", broker: "Directshares", accountKey: "DIRECTSHARES",
    externalId: "DS-TRADE:ASL", tradeDate: "2025-07-14", symbol: "ASL", exchange: "ASX",
    instrumentKey: "Directshares:ASL:ASX", type: "BUY", quantity: 23486, price: 1.45,
    cost: 34054.7, currency: "AUD", fees: 59, fxRateToBase: 1,
    source: "Directshares All Trades Report",
  };
  const data = {
    scope: "overall", storageMode: "postgresql", totalValue: 37578, investedValue: 37578,
    cashValue: 0, dailyMovement: 0, totalReturn: 3523, totalReturnPercent: 10.3,
    holdings: [holding], cashAccounts: [], allocations: [], performance: [], periodReturns: [],
    xirr: {}, income: {}, allocationTargets: [], currencyExposure: [], accounts: [],
    lastUpdated: "2026-08-20T00:00:00.000Z",
  };

  const result = buildTaxLots(data as never, [trade as never], new Date("2026-08-20T00:00:00.000Z"));
  assert.equal(result.summary.fallbackLots, 0, "the trade must date the position");
  assert.equal(result.openLots[0]?.acquisitionDate, "2025-07-14");
  assert.equal(result.openLots[0]?.discountEligible, true, "held over a year, so the CGT discount applies");
});

test("a pension-phase fund owes nothing on a gain, discount or not", () => {
  // StellaWorld is wholly in pension phase, so its gains are exempt current pension income. Run as
  // accumulation the same book reported $29,644 of gross gains as fully taxable, which would make
  // trimming a winner in the fund look expensive when it costs nothing.
  const holding = {
    id: "h1", ownerType: "SMSF" as const, broker: "IBKR", accountKey: "U24473088",
    instrumentKey: "DBA:ARCA", symbol: "DBA", name: "Invesco Agriculture", exchange: "ARCA",
    currency: "USD", assetClass: "EQUITY", quantity: 360, lastPrice: 28.38, averageCostAud: 28.22,
    costAud: 14290, marketValueAud: 14371, dayGainAud: 0, pnlAud: 81, pnlPercent: 0.57,
    valuationBasis: "market" as const, asOfDate: "2026-10-13", source: "IBKR", weight: 1,
  };
  const data = {
    scope: "smsf", storageMode: "postgresql", totalValue: 14371, investedValue: 14371,
    cashValue: 0, dailyMovement: 0, totalReturn: 81, totalReturnPercent: 0.57,
    holdings: [holding], cashAccounts: [], allocations: [], performance: [], periodReturns: [],
    xirr: {}, income: {}, allocationTargets: [], currencyExposure: [], accounts: [],
    lastUpdated: "2026-10-13T00:00:00.000Z",
  } as unknown as Parameters<typeof buildTaxLots>[0];

  const accumulation = buildTaxLots(data, [], new Date("2026-10-13T00:00:00.000Z"));
  assert.ok(accumulation.openLots[0].taxableGainIfSoldAud > 0, "accumulation taxes the gain");

  const pension = buildTaxLots(data, [], new Date("2026-10-13T00:00:00.000Z"), { pensionPhase: true });
  assert.equal(pension.openLots[0].taxableGainIfSoldAud, 0, "pension phase exempts it entirely");
  assert.equal(pension.summary.taxableGainIfSoldAud, 0, "and the summary with it");
});

test("pension phase exempts a gain that no discount would have reached anyway", () => {
  // No SMSF parcel is discount-eligible — the longest is 162 days — so without this the fund's
  // gains are reported at their full face value.
  const holding = {
    id: "h2", ownerType: "SMSF" as const, broker: "IBKR", accountKey: "U24473088",
    instrumentKey: "CDE:NYSE", symbol: "CDE", name: "Coeur Mining", exchange: "NYSE",
    currency: "USD", assetClass: "EQUITY", quantity: 2400, lastPrice: 21.1, averageCostAud: 14.74,
    costAud: 35376, marketValueAud: 70882, dayGainAud: 0, pnlAud: 35506, pnlPercent: 100.4,
    valuationBasis: "market" as const, asOfDate: "2026-10-13", source: "IBKR", weight: 1,
  };
  const data = {
    scope: "smsf", storageMode: "postgresql", totalValue: 70882, investedValue: 70882,
    cashValue: 0, dailyMovement: 0, totalReturn: 35506, totalReturnPercent: 100.4,
    holdings: [holding], cashAccounts: [], allocations: [], performance: [], periodReturns: [],
    xirr: {}, income: {}, allocationTargets: [], currencyExposure: [], accounts: [],
    lastUpdated: "2026-10-13T00:00:00.000Z",
  } as unknown as Parameters<typeof buildTaxLots>[0];

  const lot = buildTaxLots(data, [], new Date("2026-10-13T00:00:00.000Z"), { pensionPhase: true }).openLots[0];
  assert.equal(lot.discountEligible, false, "held under a year, so no discount applies");
  assert.equal(lot.taxableGainIfSoldAud, 0, "but the gain is exempt regardless");
});

test("a loss is still a loss in pension phase, not turned into zero", () => {
  // Exempt means no tax payable, and taxableGain must not quietly report a capital loss as nil in
  // a book where it has no value either — but the figure that carries is the gain column, so the
  // exemption applies to the taxable line alone.
  const holding = {
    id: "h3", ownerType: "SMSF" as const, broker: "IBKR", accountKey: "U24473088",
    instrumentKey: "VELO:NASDAQ", symbol: "VELO", name: "Velocity", exchange: "NASDAQ",
    currency: "USD", assetClass: "EQUITY", quantity: 400, lastPrice: 14.08, averageCostAud: 24.98,
    costAud: 14036, marketValueAud: 7910, dayGainAud: 0, pnlAud: -6126, pnlPercent: -43.6,
    valuationBasis: "market" as const, asOfDate: "2026-10-13", source: "IBKR", weight: 1,
  };
  const data = {
    scope: "smsf", storageMode: "postgresql", totalValue: 7910, investedValue: 7910,
    cashValue: 0, dailyMovement: 0, totalReturn: -6126, totalReturnPercent: -43.6,
    holdings: [holding], cashAccounts: [], allocations: [], performance: [], periodReturns: [],
    xirr: {}, income: {}, allocationTargets: [], currencyExposure: [], accounts: [],
    lastUpdated: "2026-10-13T00:00:00.000Z",
  } as unknown as Parameters<typeof buildTaxLots>[0];

  const lot = buildTaxLots(data, [], new Date("2026-10-13T00:00:00.000Z"), { pensionPhase: true }).openLots[0];
  assert.ok(lot.unrealisedGainAud < 0, "the loss is still reported as a loss");
  assert.equal(lot.taxableGainIfSoldAud, 0);
});

test("physical metal is dated from its asset record, so the discount can apply", () => {
  // Platinum is bought on an invoice, not a contract note, so it has no trade history and lands as
  // a fallback parcel. Undated it defaulted to no discount and reported $60,306 as fully taxable —
  // 31% of the personal book's gross gains, overstated by half.
  const holding = {
    id: "plat", ownerType: "PERSONAL" as const, broker: "Physical", accountKey: "PERSONAL-PHYSICAL",
    instrumentKey: "manual:plat", symbol: "PLATINUM", name: "Physical platinum", exchange: "PHYSICAL",
    currency: "AUD", assetClass: "Platinum bullion", quantity: 3, lastPrice: 74710.8,
    averageCostAud: 54608.8, costAud: 163826, marketValueAud: 224132, dayGainAud: 0,
    pnlAud: 60306, pnlPercent: 36.8, valuationBasis: "market" as const, asOfDate: "2026-10-13",
    source: "Manual physical", acquisitionDate: "2025-05-21", weight: 1,
  };
  const data = {
    scope: "personal", storageMode: "postgresql", totalValue: 224132, investedValue: 224132,
    cashValue: 0, dailyMovement: 0, totalReturn: 60306, totalReturnPercent: 36.8,
    holdings: [holding], cashAccounts: [], allocations: [], performance: [], periodReturns: [],
    xirr: {}, income: {}, allocationTargets: [], currencyExposure: [], accounts: [],
    lastUpdated: "2026-10-13T00:00:00.000Z",
  } as unknown as Parameters<typeof buildTaxLots>[0];

  const lot = buildTaxLots(data, [], new Date("2026-10-13T00:00:00.000Z")).openLots[0];
  assert.equal(lot.acquisitionDate, "2025-05-21");
  assert.equal(lot.heldDays, 510);
  assert.equal(lot.discountEligible, true, "held well over twelve months");
  assert.equal(Math.round(lot.taxableGainIfSoldAud), 30153, "the fifty per cent discount halves it");
});

test("a fallback parcel with no date still reports none, rather than inventing one", () => {
  const holding = {
    id: "ds", ownerType: "PERSONAL" as const, broker: "Directshares", accountKey: "4317403",
    instrumentKey: "AYA:TSX/TSXV", symbol: "AYA", name: "Aya Gold & Silver", exchange: "TSX/TSXV",
    currency: "CAD", assetClass: "Silver miners", quantity: 2050, lastPrice: 38.2,
    averageCostAud: 14.95, costAud: 30638, marketValueAud: 78356, dayGainAud: 0,
    pnlAud: 47718, pnlPercent: 155.8, valuationBasis: "market" as const, asOfDate: "2026-10-13",
    source: "Directshares", weight: 1,
  };
  const data = {
    scope: "personal", storageMode: "postgresql", totalValue: 78356, investedValue: 78356,
    cashValue: 0, dailyMovement: 0, totalReturn: 47718, totalReturnPercent: 155.8,
    holdings: [holding], cashAccounts: [], allocations: [], performance: [], periodReturns: [],
    xirr: {}, income: {}, allocationTargets: [], currencyExposure: [], accounts: [],
    lastUpdated: "2026-10-13T00:00:00.000Z",
  } as unknown as Parameters<typeof buildTaxLots>[0];

  const lot = buildTaxLots(data, [], new Date("2026-10-13T00:00:00.000Z")).openLots[0];
  assert.equal(lot.acquisitionDate, null);
  assert.equal(lot.heldDays, null);
  assert.equal(lot.discountEligible, false);
});

/** The real VAU sequence: buy 50,000, consolidate to 7,693, sell it in two parcels. */
function vauTransactions() {
  return [
    { id: "b", ownerType: "PERSONAL", broker: "Directshares", accountKey: "4317403",
      externalId: "buy", tradeDate: "2025-07-03", symbol: "VAU", exchange: "ASX",
      instrumentKey: "Directshares:VAU:ASX", type: "BUY", quantity: 50000, price: 0.4,
      cost: 20000, currency: "AUD", fees: 29.95, fxRateToBase: 1, source: "Directshares All Trades Report" },
    { id: "c", ownerType: "PERSONAL", broker: "Directshares", accountKey: "4317403",
      externalId: "action", tradeDate: "2025-11-26", symbol: "VAU", exchange: "ASX",
      instrumentKey: "Directshares:VAU:ASX", type: "CORPORATE_ACTION", quantity: -42307,
      currency: "AUD", description: "Consolidation", source: "Directshares All Trades Report" },
    { id: "s1", ownerType: "PERSONAL", broker: "Directshares", accountKey: "4317403",
      externalId: "sell1", tradeDate: "2026-04-30", symbol: "VAU", exchange: "ASX",
      instrumentKey: "Directshares:VAU:ASX", type: "SELL", quantity: 3847, price: 4.53,
      cost: 17428.91, netCash: 17396.96, currency: "AUD", fees: 31.95, fxRateToBase: 1, source: "Directshares All Trades Report" },
  ];
}

function vauDashboard() {
  return {
    scope: "personal", storageMode: "postgresql", totalValue: 0, investedValue: 0, cashValue: 0,
    dailyMovement: 0, totalReturn: 0, totalReturnPercent: 0, holdings: [], cashAccounts: [],
    allocations: [], performance: [], periodReturns: [], xirr: {}, income: {}, allocationTargets: [],
    currencyExposure: [], accounts: [], lastUpdated: "2026-06-30T00:00:00.000Z",
  } as unknown as Parameters<typeof buildTaxLots>[0];
}

test("a consolidation moves cost per unit without changing the total cost base", () => {
  // VAU's consolidation was skipped, so 7,693 units kept a 0.40 unit cost instead of 2.60 and the
  // realised gain came out $16,948 too high — half the gap against Sharesight.
  const result = buildTaxLots(vauDashboard(), vauTransactions() as never, new Date("2026-06-30T00:00:00.000Z"));
  const sold = result.realisedLots[0];
  assert.equal(sold.quantity, 3847);
  // 20,029.95 of cost over 7,693 units is 2.6037/unit, and 3,847 of them is just over half of it.
  assert.equal(sold.costAud.toFixed(2), "10016.28");
  assert.ok(sold.costAud > 10000, "not the 1,541 a pre-consolidation unit cost would give");
  assert.equal(result.unappliedActions.length, 0, "the action applied cleanly");
});

test("a consolidation does not restart the twelve-month clock", () => {
  // It is not a CGT event. Resetting the acquisition date would strip discount eligibility from
  // long-held parcels — a quieter and larger error than the cost-base one.
  const base = vauTransactions();
  const transactions = [base[0], base[1], { ...base[2], tradeDate: "2026-06-29", externalId: "sell-late" }];
  const lot = buildTaxLots(vauDashboard(), transactions as never, new Date("2026-06-30T00:00:00.000Z")).realisedLots[0];
  assert.equal(lot.acquisitionDate, "2025-07-03", "the date rides with the parcel, not the action");
  assert.equal(lot.heldDays, 361, "measured from the buy, not the consolidation");
});

test("fractional units survive a consolidation rather than being rounded away", () => {
  // 1,000 units consolidated by -875 leaves 125; selling 87.5 must stay fractional.
  const base = vauTransactions();
  const transactions = [
    { ...base[0], quantity: 1000, cost: 1000, fees: 0 },
    { ...base[1], quantity: -875 },
    { ...base[2], quantity: 87.5, cost: 500, netCash: 500 },
  ];
  const result = buildTaxLots(vauDashboard(), transactions as never, new Date("2026-06-30T00:00:00.000Z"));
  const lot = result.realisedLots[0];
  assert.equal(lot.quantity, 87.5);
  assert.equal(lot.costAud.toFixed(2), "700.00", "87.5 of 125 units carrying 1,000 of cost");
});

test("an action that cannot be applied is reported, never silently dropped", () => {
  // Silence is what let VAU through. An action with no acquisition history to rescale has to say so.
  const orphan = [{
    id: "c", ownerType: "PERSONAL", broker: "Directshares", accountKey: "4317403",
    externalId: "action", tradeDate: "2025-11-26", symbol: "ZZZ", exchange: "ASX",
    instrumentKey: "Directshares:ZZZ:ASX", type: "CORPORATE_ACTION", quantity: -500,
    currency: "AUD", description: "Consolidation", source: "Directshares All Trades Report",
  }];
  const result = buildTaxLots(vauDashboard(), orphan as never, new Date("2026-06-30T00:00:00.000Z"));
  assert.equal(result.unappliedActions.length, 1);
  assert.equal(result.unappliedActions[0].symbol, "ZZZ");
  assert.match(result.unappliedActions[0].reason, /no acquisition history/);
});
