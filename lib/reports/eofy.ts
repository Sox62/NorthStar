import { buildTaxLots, type RealisedTaxLot } from "@/lib/tax-lots";
import type { DashboardData, DashboardHolding, OwnerType, Scope, StoredTransaction } from "@/lib/storage";
import { sectorForInstrument } from "@/northstar/lib/sector-map";

export type EofyScope = "personal" | "smsf";

export type EofyReport = {
  scope: EofyScope;
  ownerType: OwnerType;
  ownerLabel: string;
  financialYear: {
    year: number;
    label: string;
    startDate: string;
    endDate: string;
  };
  generatedAt: string;
  valuationAsOf: string | null;
  summary: {
    dividendPayments: number;
    grossIncomeAud: number;
    netIncomeAud: number;
    frankingCreditsAud: number;
    taxWithheldAud: number;
    feesAud: number;
    realisedLots: number;
    realisedGainsAud: number;
    realisedLossesAud: number;
    netRealisedAud: number;
    taxableRealisedAud: number;
    buyTrades: number;
    sellTrades: number;
    buysAud: number;
    sellsAud: number;
    tradeFeesAud: number;
    currentHoldings: number;
    currentMarketValueAud: number;
    currentCostBaseAud: number;
  };
  incomeBySymbol: EofyIncomeSymbol[];
  incomePayments: EofyIncomePayment[];
  realisedLots: RealisedTaxLot[];
  tradeMovements: EofyTradeMovement[];
  currentHoldings: EofyHoldingReference[];
  dataQuality: string[];
};

export type EofyIncomeSymbol = {
  symbol: string;
  name: string;
  payments: number;
  grossIncomeAud: number;
  netIncomeAud: number;
  frankingCreditsAud: number;
  taxWithheldAud: number;
  feesAud: number;
};

export type EofyIncomePayment = {
  id: string;
  symbol: string;
  name: string;
  broker: string;
  paymentDate: string;
  exDate: string | null;
  currency: string;
  grossIncomeAud: number;
  netIncomeAud: number;
  frankingCreditsAud: number;
  taxWithheldAud: number;
  feesAud: number;
  units: number | null;
  source: string;
};

export type EofyTradeMovement = {
  id: string;
  type: "BUY" | "SELL";
  symbol: string;
  name: string;
  broker: string;
  tradeDate: string;
  settleDate: string | null;
  quantity: number;
  currency: string;
  grossAud: number;
  feesAud: number;
  taxesAud: number;
  netCashAud: number;
  source: string;
};

export type EofyHoldingReference = {
  id: string;
  symbol: string;
  name: string;
  broker: string;
  sector: string;
  quantity: number;
  currency: string;
  costAud: number;
  marketValueAud: number;
  unrealisedAud: number;
  asOfDate: string;
  source: string;
};

type CsvCell = string | number | null | undefined;
type CsvRow = CsvCell[];

const personalScope: EofyScope = "personal";
const smsScope: EofyScope = "smsf";

function isEofyScope(value: string | null): value is EofyScope {
  return value === personalScope || value === smsScope;
}

export function eofyScopeFromRequest(value: string | null): EofyScope {
  return isEofyScope(value) ? value : personalScope;
}

export function ownerTypeForEofyScope(scope: EofyScope): OwnerType {
  return scope === smsScope ? "SMSF" : "PERSONAL";
}

export function ownerLabelForEofyScope(scope: EofyScope) {
  return scope === smsScope ? "SMSF" : "Personal";
}

export function defaultFinancialYearEnding(today = new Date()) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  return month >= 7 ? year : year - 1;
}

export function financialYearFromRequest(value: string | null, today = new Date()) {
  const parsed = value ? Number(value) : defaultFinancialYearEnding(today);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return defaultFinancialYearEnding(today);
  return parsed;
}

export function financialYear(year: number) {
  return {
    year,
    label: `FY${year}`,
    startDate: `${year - 1}-07-01`,
    endDate: `${year}-06-30`,
  };
}

function dateInRange(value: string | null | undefined, startDate: string, endDate: string) {
  return Boolean(value && value >= startDate && value <= endDate);
}

function amount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function rawAmount(transaction: StoredTransaction, keys: string[]) {
  const raw = transaction.raw;
  if (!raw) return 0;
  for (const key of keys) {
    const value = amount(raw[key]);
    if (value) return value;
  }
  return 0;
}

function transactionAud(value: number | null | undefined, transaction: StoredTransaction) {
  if (!value) return 0;
  return transaction.currency === "AUD" ? value : value * (transaction.fxRateToBase ?? 1);
}

function transactionGrossAud(transaction: StoredTransaction) {
  return Math.abs(transactionAud(transaction.cost, transaction));
}

function transactionNetCashAud(transaction: StoredTransaction) {
  return transactionAud(transaction.netCash, transaction);
}

function dividendGrossAud(transaction: StoredTransaction, netIncomeAud: number, taxWithheldAud: number, frankingCreditsAud: number) {
  return rawAmount(transaction, ["grossDividendAud", "grossDividend"]) || netIncomeAud + taxWithheldAud + frankingCreditsAud;
}

function dividendFrankingCreditsAud(transaction: StoredTransaction) {
  return rawAmount(transaction, ["frankingCreditAud", "frankingCredit"]);
}

function dividendExDate(transaction: StoredTransaction) {
  const raw = transaction.raw;
  const value = raw?.exDate;
  return typeof value === "string" && value ? value : null;
}

function dividendUnits(transaction: StoredTransaction) {
  const shares = rawAmount(transaction, ["shares", "units", "holdings"]);
  return shares || null;
}

function incomeRows(transactions: StoredTransaction[], startDate: string, endDate: string) {
  const payments: EofyIncomePayment[] = [];
  const symbols = new Map<string, EofyIncomeSymbol>();

  for (const transaction of transactions) {
    if (transaction.type !== "DIVIDEND" || !dateInRange(transaction.tradeDate, startDate, endDate)) continue;
    const netIncomeAud = transactionAud(transaction.netCash, transaction);
    const taxWithheldAud = transactionAud(transaction.taxes, transaction);
    const feesAud = transactionAud(transaction.fees, transaction);
    const frankingCreditsAud = dividendFrankingCreditsAud(transaction);
    const grossIncomeAud = dividendGrossAud(transaction, netIncomeAud, taxWithheldAud, frankingCreditsAud);
    const symbol = transaction.symbol || "Income";
    const name = transaction.description || `${symbol} dividend`;
    const payment = {
      id: transaction.id,
      symbol,
      name,
      broker: transaction.broker,
      paymentDate: transaction.tradeDate,
      exDate: dividendExDate(transaction),
      currency: transaction.currency,
      grossIncomeAud,
      netIncomeAud,
      frankingCreditsAud,
      taxWithheldAud,
      feesAud,
      units: dividendUnits(transaction),
      source: transaction.source,
    };
    const row = symbols.get(symbol) ?? {
      symbol,
      name,
      payments: 0,
      grossIncomeAud: 0,
      netIncomeAud: 0,
      frankingCreditsAud: 0,
      taxWithheldAud: 0,
      feesAud: 0,
    };

    row.payments += 1;
    row.grossIncomeAud += grossIncomeAud;
    row.netIncomeAud += netIncomeAud;
    row.frankingCreditsAud += frankingCreditsAud;
    row.taxWithheldAud += taxWithheldAud;
    row.feesAud += feesAud;
    symbols.set(symbol, row);
    payments.push(payment);
  }

  return {
    payments: payments.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.symbol.localeCompare(b.symbol)),
    symbols: [...symbols.values()].sort((a, b) => b.grossIncomeAud - a.grossIncomeAud),
  };
}

function tradeRows(transactions: StoredTransaction[], startDate: string, endDate: string) {
  return transactions
    .filter((transaction) => (transaction.type === "BUY" || transaction.type === "SELL") && dateInRange(transaction.tradeDate, startDate, endDate))
    .map((transaction): EofyTradeMovement => ({
      id: transaction.id,
      type: transaction.type as "BUY" | "SELL",
      symbol: transaction.symbol,
      name: transaction.description || transaction.symbol,
      broker: transaction.broker,
      tradeDate: transaction.tradeDate,
      settleDate: transaction.settleDate ?? null,
      quantity: Math.abs(transaction.quantity ?? 0),
      currency: transaction.currency,
      grossAud: transactionGrossAud(transaction),
      feesAud: transactionAud(transaction.fees, transaction),
      taxesAud: transactionAud(transaction.taxes, transaction),
      netCashAud: transactionNetCashAud(transaction),
      source: transaction.source,
    }))
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.symbol.localeCompare(b.symbol));
}

function holdingReference(holding: DashboardHolding): EofyHoldingReference {
  return {
    id: holding.id,
    symbol: holding.symbol,
    name: holding.name,
    broker: holding.broker,
    sector: sectorForInstrument(holding),
    quantity: holding.quantity,
    currency: holding.currency,
    costAud: holding.costAud,
    marketValueAud: holding.marketValueAud,
    unrealisedAud: holding.marketValueAud - holding.costAud,
    asOfDate: holding.asOfDate,
    source: holding.source,
  };
}

function realisedSummary(lots: RealisedTaxLot[]) {
  const realisedGainsAud = lots.reduce((sum, lot) => lot.realisedGainAud > 0 ? sum + lot.realisedGainAud : sum, 0);
  const realisedLossesAud = lots.reduce((sum, lot) => lot.realisedGainAud < 0 ? sum + Math.abs(lot.realisedGainAud) : sum, 0);
  return {
    realisedGainsAud,
    realisedLossesAud,
    netRealisedAud: realisedGainsAud - realisedLossesAud,
    taxableRealisedAud: lots.reduce((sum, lot) => sum + lot.taxableGainAud, 0),
  };
}

function dataQualityNotes(report: {
  incomePayments: EofyIncomePayment[];
  realisedLots: RealisedTaxLot[];
  currentHoldings: EofyHoldingReference[];
  valuationAsOf: string | null;
}) {
  const notes = [
    "Prepared from imported NorthStar broker transactions and dividend notifications. Accountant should verify against broker statements.",
    "Current holdings are included as a reconciliation reference using the latest available valuation, not a reconstructed 30 June historical valuation.",
  ];

  if (!report.incomePayments.length) notes.push("No dividend or distribution income is stored for this financial year and owner scope.");
  if (!report.realisedLots.length) notes.push("No realised sale lots are stored for this financial year and owner scope.");
  if (report.realisedLots.some((lot) => lot.acquisitionDate == null)) notes.push("Some sale lots are missing acquisition history and use broker realised P/L or an incomplete cost-base estimate.");
  if (report.currentHoldings.some((holding) => holding.source === "position_fallback")) notes.push("Some open holding cost bases use current position fallback data because complete transaction history is not yet available.");
  if (!report.valuationAsOf) notes.push("No valuation date is recorded for the current open-position reference.");

  return notes;
}

export function buildEofyReport(scope: EofyScope, dashboard: DashboardData, transactions: StoredTransaction[], year: number, generatedAt = new Date()): EofyReport {
  const fy = financialYear(year);
  const income = incomeRows(transactions, fy.startDate, fy.endDate);
  const allTaxLots = buildTaxLots(dashboard, transactions, generatedAt);
  const realisedLots = allTaxLots.realisedLots.filter((lot) => dateInRange(lot.saleDate, fy.startDate, fy.endDate));
  const tradeMovements = tradeRows(transactions, fy.startDate, fy.endDate);
  const currentHoldings = dashboard.holdings
    .filter((holding) => holding.marketValueAud || holding.costAud || holding.quantity)
    .map(holdingReference)
    .sort((a, b) => b.marketValueAud - a.marketValueAud);
  const realised = realisedSummary(realisedLots);
  const buyTrades = tradeMovements.filter((trade) => trade.type === "BUY");
  const sellTrades = tradeMovements.filter((trade) => trade.type === "SELL");
  const draftReport = {
    incomePayments: income.payments,
    realisedLots,
    currentHoldings,
    valuationAsOf: dashboard.lastUpdated,
  };

  return {
    scope,
    ownerType: ownerTypeForEofyScope(scope),
    ownerLabel: ownerLabelForEofyScope(scope),
    financialYear: fy,
    generatedAt: generatedAt.toISOString(),
    valuationAsOf: dashboard.lastUpdated,
    summary: {
      dividendPayments: income.payments.length,
      grossIncomeAud: income.payments.reduce((sum, row) => sum + row.grossIncomeAud, 0),
      netIncomeAud: income.payments.reduce((sum, row) => sum + row.netIncomeAud, 0),
      frankingCreditsAud: income.payments.reduce((sum, row) => sum + row.frankingCreditsAud, 0),
      taxWithheldAud: income.payments.reduce((sum, row) => sum + row.taxWithheldAud, 0),
      feesAud: income.payments.reduce((sum, row) => sum + row.feesAud, 0),
      realisedLots: realisedLots.length,
      ...realised,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      buysAud: buyTrades.reduce((sum, row) => sum + row.grossAud + row.feesAud + row.taxesAud, 0),
      sellsAud: sellTrades.reduce((sum, row) => sum + Math.abs(row.netCashAud || row.grossAud), 0),
      tradeFeesAud: tradeMovements.reduce((sum, row) => sum + row.feesAud + row.taxesAud, 0),
      currentHoldings: currentHoldings.length,
      currentMarketValueAud: currentHoldings.reduce((sum, row) => sum + row.marketValueAud, 0),
      currentCostBaseAud: currentHoldings.reduce((sum, row) => sum + row.costAud, 0),
    },
    incomeBySymbol: income.symbols,
    incomePayments: income.payments,
    realisedLots,
    tradeMovements,
    currentHoldings,
    dataQuality: dataQualityNotes(draftReport),
  };
}

function csvCell(value: CsvCell) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function money(value: number) {
  return value.toFixed(2);
}

function number(value: number | null | undefined) {
  return value == null ? "" : value.toFixed(6).replace(/\.?0+$/, "");
}

function csv(rows: CsvRow[]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function eofyReportCsv(report: EofyReport) {
  const rows: CsvRow[] = [[
    "section",
    "owner",
    "financial_year",
    "item",
    "symbol",
    "broker",
    "trade_date",
    "settle_date",
    "quantity",
    "currency",
    "gross_income_aud",
    "net_income_aud",
    "franking_credits_aud",
    "tax_withheld_aud",
    "fees_aud",
    "cost_base_aud",
    "proceeds_aud",
    "capital_gain_aud",
    "taxable_gain_aud",
    "detail",
    "as_of",
  ]];

  rows.push([
    "metadata",
    report.ownerLabel,
    report.financialYear.label,
    "NorthStar EOFY accountant pack",
    "",
    "",
    report.financialYear.startDate,
    report.financialYear.endDate,
    "",
    "AUD",
    money(report.summary.grossIncomeAud),
    money(report.summary.netIncomeAud),
    money(report.summary.frankingCreditsAud),
    money(report.summary.taxWithheldAud),
    money(report.summary.feesAud),
    money(report.summary.currentCostBaseAud),
    money(report.summary.sellsAud),
    money(report.summary.netRealisedAud),
    money(report.summary.taxableRealisedAud),
    `Generated ${report.generatedAt}; current valuation reference ${report.valuationAsOf ?? "not recorded"}`,
    report.valuationAsOf,
  ]);

  for (const row of report.incomeBySymbol) {
    rows.push([
      "income_summary",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.symbol,
      "",
      "",
      "",
      row.payments,
      "AUD",
      money(row.grossIncomeAud),
      money(row.netIncomeAud),
      money(row.frankingCreditsAud),
      money(row.taxWithheldAud),
      money(row.feesAud),
      "",
      "",
      "",
      "",
      `${row.payments} payment${row.payments === 1 ? "" : "s"}`,
      report.financialYear.endDate,
    ]);
  }

  for (const row of report.incomePayments) {
    rows.push([
      "income_payment",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.symbol,
      row.broker,
      row.paymentDate,
      row.exDate,
      number(row.units),
      row.currency,
      money(row.grossIncomeAud),
      money(row.netIncomeAud),
      money(row.frankingCreditsAud),
      money(row.taxWithheldAud),
      money(row.feesAud),
      "",
      "",
      "",
      "",
      row.source,
      row.paymentDate,
    ]);
  }

  for (const row of report.realisedLots) {
    rows.push([
      "realised_cgt_lot",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.symbol,
      row.broker,
      row.saleDate,
      "",
      number(row.quantity),
      "AUD",
      "",
      "",
      "",
      "",
      "",
      money(row.costAud),
      money(row.proceedsAud),
      money(row.realisedGainAud),
      money(row.taxableGainAud),
      `${row.note}; acquired ${row.acquisitionDate ?? "unknown"}; held ${row.heldDays ?? "unknown"} days; discount ${row.discountEligible ? `${Math.round(row.discountRate * 100)}%` : "not eligible"}`,
      row.saleDate,
    ]);
  }

  for (const row of report.tradeMovements) {
    rows.push([
      "trade_movement",
      report.ownerLabel,
      report.financialYear.label,
      row.type,
      row.symbol,
      row.broker,
      row.tradeDate,
      row.settleDate,
      number(row.quantity),
      row.currency,
      "",
      money(row.netCashAud),
      "",
      money(row.taxesAud),
      money(row.feesAud),
      row.type === "BUY" ? money(row.grossAud + row.feesAud + row.taxesAud) : "",
      row.type === "SELL" ? money(Math.abs(row.netCashAud || row.grossAud)) : "",
      "",
      "",
      row.source,
      row.tradeDate,
    ]);
  }

  for (const row of report.currentHoldings) {
    rows.push([
      "current_holding_reference",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.symbol,
      row.broker,
      "",
      "",
      number(row.quantity),
      row.currency,
      "",
      "",
      "",
      "",
      "",
      money(row.costAud),
      money(row.marketValueAud),
      money(row.unrealisedAud),
      "",
      `${row.sector}; current valuation reference; ${row.source}`,
      row.asOfDate,
    ]);
  }

  for (const note of report.dataQuality) {
    rows.push(["data_quality", report.ownerLabel, report.financialYear.label, note, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", report.generatedAt]);
  }

  return csv(rows);
}
