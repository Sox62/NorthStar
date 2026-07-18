import { buildTaxLots, type OpenTaxLot, type RealisedTaxLot } from "@/lib/tax-lots";
import type { DashboardData, DashboardHolding, OwnerType, PriceBook, StoredDailyPrice, StoredFxRate, StoredTransaction } from "@/lib/storage";
import { sectorForInstrument } from "@/northstar/lib/sector-map";

export type EofyScope = "personal";

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
  taxableIncome: EofyTaxableIncomeSections;
  capitalGains: EofyCapitalGainsReport;
  realisedLots: RealisedTaxLot[];
  unrealisedCgt: EofyUnrealisedCgtReport;
  historicalCost: EofyHistoricalCostRow[];
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

export type EofyTaxableIncomeSections = {
  australianNonTrust: EofyAustralianIncomeRow[];
  australianTrust: EofyAustralianIncomeRow[];
  foreign: EofyForeignIncomeRow[];
};

export type EofyAustralianIncomeRow = {
  code: string;
  name: string;
  paidDate: string;
  totalIncomeAud: number;
  netAmountAud: number;
  frankedAmountAud: number;
  unfrankedAmountAud: number;
  interestAud: number;
  taxDeferredAud: number;
  amitCostBaseDecreaseAud: number;
  amitCostBaseIncreaseAud: number;
  foreignSourceIncomeAud: number;
  discountedCapitalGainsAud: number;
  capitalGainsAud: number;
  cgtConcessionAud: number;
  nonAssessableAud: number;
  tfnWithholdingAud: number;
  foreignIncomeTaxAud: number;
  frankingCreditsAud: number;
  otherNetForeignSourceIncomeAud: number;
  licCapitalGainAud: number;
  grossDividendAud: number;
  comments: string;
};

export type EofyForeignIncomeRow = {
  code: string;
  name: string;
  paidDate: string;
  exchangeRate: number | null;
  currency: string;
  netAmountAud: number;
  foreignTaxWithheldAud: number;
  grossAmountAud: number;
  country: string;
  incomeType: string;
  comments: string;
};

export type EofyCapitalGainsReport = {
  summary: {
    shortTermGainsAud: number;
    longTermGainsAud: number;
    lossesAud: number;
    nonDiscountedDistributionsAud: number;
    discountedDistributionsGrossAud: number;
    totalCurrentYearCapitalGainsAud: number;
    shortTermGainsAfterLossesAud: number;
    longTermGainsAfterLossesAud: number;
    cgtConcessionAud: number;
    netCapitalGainAud: number;
    discountRate: number;
  };
  byHolding: EofyCapitalGainsHolding[];
  shortTerm: RealisedTaxLot[];
  longTerm: RealisedTaxLot[];
  losses: RealisedTaxLot[];
};

export type EofyCapitalGainsHolding = {
  name: string;
  market: string;
  code: string;
  soldQuantity: number;
  shortTermGainsAud: number;
  longTermGainsAud: number;
  lossesAud: number;
  totalGainAud: number;
};

export type EofyUnrealisedCgtReport = {
  shortTerm: OpenTaxLot[];
  longTerm: OpenTaxLot[];
  losses: OpenTaxLot[];
  summary: {
    shortTermGainsAud: number;
    longTermGainsAud: number;
    lossesAud: number;
  };
};

export type EofyValuationStatus = "exact" | "prior_close" | "missing_price" | "missing_fx" | "zero_quantity";

export type EofyHistoricalCostRow = {
  market: string;
  code: string;
  name: string;
  allocationMethod: string;
  openingBalanceAud: number;
  openingMarketValueAud: number | null;
  openingQuantity: number;
  purchasesAud: number;
  costOfSalesAud: number;
  capitalAdjustmentsAud: number;
  closingBalanceAud: number;
  closingMarketValueAud: number | null;
  closingPrice: number | null;
  closingPriceCurrency: string | null;
  closingPriceDate: string | null;
  closingFxRateToAud: number | null;
  closingValuationStatus: EofyValuationStatus;
  closingValuationSource: string | null;
  closingQuantity: number;
};

export type EofyTradeMovement = {
  id: string;
  type: "BUY" | "SELL";
  symbol: string;
  exchange: string;
  name: string;
  broker: string;
  tradeDate: string;
  settleDate: string | null;
  quantity: number;
  price: number | null;
  currency: string;
  fxRateToAud: number | null;
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

export function ownerTypeForEofyScope(_scope: EofyScope): OwnerType {
  return "PERSONAL";
}

export function ownerLabelForEofyScope(_scope: EofyScope) {
  return "Personal";
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

function rawString(transaction: StoredTransaction, keys: string[]) {
  const raw = transaction.raw;
  if (!raw) return "";
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function instrumentCode(transaction: StoredTransaction) {
  const exchange = transaction.exchange ? `.${transaction.exchange}` : "";
  return `${transaction.symbol}${exchange}`;
}

function countryForIncome(transaction: StoredTransaction, currency: string) {
  const exchange = transaction.exchange.toUpperCase();
  if (exchange.includes("NYSE") || exchange === "US" || currency === "USD") return "United States";
  if (exchange.includes("TSX") || exchange === "TSE" || exchange === "CVE" || currency === "CAD") return "Canada";
  if (exchange.includes("LSE") || currency === "GBP") return "United Kingdom";
  return "Australia";
}

function isTrustLikeIncome(transaction: StoredTransaction) {
  const haystack = `${transaction.symbol} ${transaction.description ?? ""}`.toUpperCase();
  return /\b(ETF|ETFS|FUND|TRUST|BETASHARES|VANECK|ISHARES|GLOBAL X|SPROTT|ETP|ETC)\b/.test(haystack);
}

function incomeComment(transaction: StoredTransaction) {
  const rate = rawAmount(transaction, ["grossDividendRateLocal", "centsPerShare"]);
  if (rate) return `Dividend of ${rate} per share`;
  return transaction.source;
}

function taxableIncomeRows(transactions: StoredTransaction[], startDate: string, endDate: string): EofyTaxableIncomeSections {
  const sections: EofyTaxableIncomeSections = { australianNonTrust: [], australianTrust: [], foreign: [] };

  for (const transaction of transactions) {
    if (transaction.type !== "DIVIDEND" || !dateInRange(transaction.tradeDate, startDate, endDate)) continue;

    const localCurrency = rawString(transaction, ["localCurrency"]) || transaction.currency;
    const netAmountAud = transactionAud(transaction.netCash, transaction);
    const foreignTaxWithheldAud = transactionAud(transaction.taxes, transaction);
    const frankingCreditsAud = dividendFrankingCreditsAud(transaction);
    const totalIncomeAud = dividendGrossAud(transaction, netAmountAud, foreignTaxWithheldAud, 0);
    const frankedAmountAud = rawAmount(transaction, ["frankedAmountAud", "frankedAmount", "franked"]);
    const unfrankedAmountAud = rawAmount(transaction, ["unfrankedAmountAud", "unfrankedAmount", "unfranked"]) || Math.max(0, totalIncomeAud - frankedAmountAud);
    const code = instrumentCode(transaction);
    const name = transaction.description || `${transaction.symbol} dividend`;
    const comments = incomeComment(transaction);
    const isForeign = localCurrency !== "AUD" || !["ASX", "AU"].includes(transaction.exchange.toUpperCase());

    if (isForeign) {
      sections.foreign.push({
        code,
        name,
        paidDate: transaction.tradeDate,
        exchangeRate: rawAmount(transaction, ["exchangeRate"]) || transaction.fxRateToBase || null,
        currency: localCurrency,
        netAmountAud,
        foreignTaxWithheldAud,
        grossAmountAud: totalIncomeAud,
        country: countryForIncome(transaction, localCurrency),
        incomeType: "Dividend",
        comments,
      });
      continue;
    }

    const row: EofyAustralianIncomeRow = {
      code,
      name,
      paidDate: transaction.tradeDate,
      totalIncomeAud,
      netAmountAud,
      frankedAmountAud,
      unfrankedAmountAud,
      interestAud: 0,
      taxDeferredAud: rawAmount(transaction, ["taxDeferredAud", "taxDeferred"]),
      amitCostBaseDecreaseAud: rawAmount(transaction, ["amitCostBaseDecreaseAud", "amitCostBaseDecrease"]),
      amitCostBaseIncreaseAud: rawAmount(transaction, ["amitCostBaseIncreaseAud", "amitCostBaseIncrease"]),
      foreignSourceIncomeAud: rawAmount(transaction, ["foreignSourceIncomeAud", "foreignSourceIncome"]),
      discountedCapitalGainsAud: rawAmount(transaction, ["discountedCapitalGainsAud", "discountedCapitalGains"]),
      capitalGainsAud: rawAmount(transaction, ["capitalGainsAud", "capitalGains"]),
      cgtConcessionAud: rawAmount(transaction, ["cgtConcessionAud", "cgtConcession"]),
      nonAssessableAud: rawAmount(transaction, ["nonAssessableAud", "nonAssessable"]),
      tfnWithholdingAud: rawAmount(transaction, ["tfnWithholdingAud", "tfnWithholding", "tfnWt"]),
      foreignIncomeTaxAud: foreignTaxWithheldAud,
      frankingCreditsAud,
      otherNetForeignSourceIncomeAud: rawAmount(transaction, ["otherNetForeignSourceIncomeAud", "otherNetFsi"]),
      licCapitalGainAud: rawAmount(transaction, ["licCapitalGainAud", "licCapitalGain"]),
      grossDividendAud: totalIncomeAud + frankingCreditsAud,
      comments,
    };

    if (isTrustLikeIncome(transaction)) sections.australianTrust.push(row);
    else sections.australianNonTrust.push(row);
  }

  sections.australianNonTrust.sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.code.localeCompare(b.code));
  sections.australianTrust.sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.code.localeCompare(b.code));
  sections.foreign.sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.code.localeCompare(b.code));
  return sections;
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
      exchange: transaction.exchange,
      name: transaction.description || transaction.symbol,
      broker: transaction.broker,
      tradeDate: transaction.tradeDate,
      settleDate: transaction.settleDate ?? null,
      quantity: Math.abs(transaction.quantity ?? 0),
      price: transaction.price ?? null,
      currency: transaction.currency,
      fxRateToAud: transaction.fxRateToBase ?? null,
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

function capitalGainDiscountRate(_scope: EofyScope) {
  return 0.5;
}

function capitalGainsReport(scope: EofyScope, realisedLots: RealisedTaxLot[]): EofyCapitalGainsReport {
  const shortTerm = realisedLots.filter((lot) => lot.realisedGainAud > 0 && !lot.discountEligible);
  const longTerm = realisedLots.filter((lot) => lot.realisedGainAud > 0 && lot.discountEligible);
  const losses = realisedLots.filter((lot) => lot.realisedGainAud < 0);
  const shortTermGainsAud = shortTerm.reduce((sum, lot) => sum + lot.realisedGainAud, 0);
  const longTermGainsAud = longTerm.reduce((sum, lot) => sum + lot.realisedGainAud, 0);
  const lossesAud = losses.reduce((sum, lot) => sum + lot.realisedGainAud, 0);
  const lossesAvailable = Math.abs(lossesAud);
  const shortTermLossOffset = Math.min(shortTermGainsAud, lossesAvailable);
  const remainingLossOffset = Math.max(0, lossesAvailable - shortTermLossOffset);
  const longTermLossOffset = Math.min(longTermGainsAud, remainingLossOffset);
  const shortTermGainsAfterLossesAud = Math.max(0, shortTermGainsAud - shortTermLossOffset);
  const longTermGainsAfterLossesAud = Math.max(0, longTermGainsAud - longTermLossOffset);
  const discountRate = capitalGainDiscountRate(scope);
  const cgtConcessionAud = longTermGainsAfterLossesAud * discountRate;
  const byHolding = new Map<string, EofyCapitalGainsHolding>();

  for (const lot of realisedLots) {
    const key = `${lot.exchange}:${lot.symbol}`;
    const row = byHolding.get(key) ?? {
      name: lot.name,
      market: lot.exchange,
      code: lot.symbol,
      soldQuantity: 0,
      shortTermGainsAud: 0,
      longTermGainsAud: 0,
      lossesAud: 0,
      totalGainAud: 0,
    };
    row.soldQuantity += lot.quantity;
    if (lot.realisedGainAud < 0) row.lossesAud += lot.realisedGainAud;
    else if (lot.discountEligible) row.longTermGainsAud += lot.realisedGainAud;
    else row.shortTermGainsAud += lot.realisedGainAud;
    row.totalGainAud = row.shortTermGainsAud + row.longTermGainsAud;
    byHolding.set(key, row);
  }

  return {
    summary: {
      shortTermGainsAud,
      longTermGainsAud,
      lossesAud,
      nonDiscountedDistributionsAud: 0,
      discountedDistributionsGrossAud: 0,
      totalCurrentYearCapitalGainsAud: shortTermGainsAud + longTermGainsAud,
      shortTermGainsAfterLossesAud,
      longTermGainsAfterLossesAud,
      cgtConcessionAud,
      netCapitalGainAud: shortTermGainsAfterLossesAud + longTermGainsAfterLossesAud - cgtConcessionAud,
      discountRate,
    },
    byHolding: [...byHolding.values()].sort((a, b) => b.totalGainAud + b.lossesAud - (a.totalGainAud + a.lossesAud)),
    shortTerm: shortTerm.sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.symbol.localeCompare(b.symbol)),
    longTerm: longTerm.sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.symbol.localeCompare(b.symbol)),
    losses: losses.sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.symbol.localeCompare(b.symbol)),
  };
}

function upper(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function exchangeMatchRank(priceExchange: string, rowMarket: string) {
  const price = upper(priceExchange);
  const market = upper(rowMarket);
  if (price === market) return 0;

  const canadian = new Set(["CA", "CANADA", "TSX", "TSXV", "TSE", "CVE"]);
  if (canadian.has(price) && canadian.has(market)) return 1;

  const australian = new Set(["AU", "ASX", "CHIXAU"]);
  if (australian.has(price) && australian.has(market)) return 1;

  const us = new Set(["US", "USA", "NYSE", "NASDAQ", "AMEX", "ARCA"]);
  if (us.has(price) && us.has(market)) return 1;

  return null;
}

function canonicalMarket(value: string) {
  const market = upper(value);
  if (["CA", "CANADA", "TSX", "TSXV", "TSE", "CVE"].includes(market)) return "CA";
  if (["AU", "ASX", "CHIXAU"].includes(market)) return "ASX";
  if (["US", "USA", "NYSE", "NASDAQ", "AMEX", "ARCA"].includes(market)) return "US";
  return market;
}

function latestEofyPrice(priceBook: PriceBook | undefined, row: Pick<EofyHistoricalCostRow, "code" | "market">, endDate: string): StoredDailyPrice | null {
  if (!priceBook) return null;
  return priceBook.prices
    .map((price) => ({ price, rank: upper(price.symbol) === upper(row.code) ? exchangeMatchRank(price.exchange, row.market) : null }))
    .filter((candidate): candidate is { price: StoredDailyPrice; rank: number } => candidate.rank != null && candidate.price.priceDate <= endDate)
    .sort((a, b) => a.rank - b.rank || b.price.priceDate.localeCompare(a.price.priceDate) || b.price.retrievedAt.localeCompare(a.price.retrievedAt))[0]?.price ?? null;
}

function latestEofyFx(priceBook: PriceBook | undefined, currency: string, endDate: string): StoredFxRate | null {
  if (upper(currency) === "AUD") {
    return {
      id: "AUD",
      currency: "AUD",
      rateToAud: 1,
      rateDate: endDate,
      source: "AUD",
      retrievedAt: `${endDate}T00:00:00.000Z`,
    };
  }
  if (!priceBook) return null;
  return priceBook.fxRates
    .filter((rate) => upper(rate.currency) === upper(currency) && rate.rateDate <= endDate)
    .sort((a, b) => b.rateDate.localeCompare(a.rateDate) || b.retrievedAt.localeCompare(a.retrievedAt))[0] ?? null;
}

function historicalValuation(row: Pick<EofyHistoricalCostRow, "code" | "market" | "closingQuantity">, priceBook: PriceBook | undefined, endDate: string): Pick<EofyHistoricalCostRow, "closingMarketValueAud" | "closingPrice" | "closingPriceCurrency" | "closingPriceDate" | "closingFxRateToAud" | "closingValuationStatus" | "closingValuationSource"> {
  if (Math.abs(row.closingQuantity) <= 0.000001) {
    return {
      closingMarketValueAud: 0,
      closingPrice: null,
      closingPriceCurrency: null,
      closingPriceDate: null,
      closingFxRateToAud: null,
      closingValuationStatus: "zero_quantity",
      closingValuationSource: "No open quantity at EOFY.",
    };
  }

  const price = latestEofyPrice(priceBook, row, endDate);
  if (!price) {
    return {
      closingMarketValueAud: null,
      closingPrice: null,
      closingPriceCurrency: null,
      closingPriceDate: null,
      closingFxRateToAud: null,
      closingValuationStatus: "missing_price",
      closingValuationSource: null,
    };
  }

  const fx = latestEofyFx(priceBook, price.currency, endDate);
  if (!fx) {
    return {
      closingMarketValueAud: null,
      closingPrice: price.close,
      closingPriceCurrency: price.currency,
      closingPriceDate: price.priceDate,
      closingFxRateToAud: null,
      closingValuationStatus: "missing_fx",
      closingValuationSource: price.source,
    };
  }

  const status: EofyValuationStatus = price.priceDate === endDate ? "exact" : "prior_close";
  return {
    closingMarketValueAud: row.closingQuantity * price.close * fx.rateToAud,
    closingPrice: price.close,
    closingPriceCurrency: price.currency,
    closingPriceDate: price.priceDate,
    closingFxRateToAud: fx.rateToAud,
    closingValuationStatus: status,
    closingValuationSource: fx.currency === "AUD" ? price.source : `${price.source}; FX ${fx.source} ${fx.rateDate}`,
  };
}

function historicalKey(input: Pick<EofyHistoricalCostRow, "code" | "market"> | Pick<OpenTaxLot, "symbol" | "exchange">) {
  const code = "code" in input ? input.code : input.symbol;
  const market = "market" in input ? input.market : input.exchange;
  return `${upper(code)}:${canonicalMarket(market)}`;
}

function valuationRank(status: EofyValuationStatus) {
  const ranks: Record<EofyValuationStatus, number> = {
    exact: 0,
    prior_close: 1,
    zero_quantity: 1,
    missing_fx: 2,
    missing_price: 3,
  };
  return ranks[status];
}

function lotValuationMap(rows: EofyHistoricalCostRow[], lots: OpenTaxLot[]) {
  const lotQuantities = new Map<string, number>();
  for (const lot of lots) lotQuantities.set(historicalKey(lot), (lotQuantities.get(historicalKey(lot)) ?? 0) + lot.quantity);

  const valuations = new Map<string, { quantity: number; lotQuantity: number; marketValueAud: number | null; status: EofyValuationStatus; date: string | null }>();
  for (const row of rows) {
    const key = historicalKey(row);
    const existing = valuations.get(key);
    const marketValueAud = !existing
      ? row.closingMarketValueAud
      : existing.marketValueAud == null || row.closingMarketValueAud == null ? null : existing.marketValueAud + row.closingMarketValueAud;
    const status = !existing || valuationRank(row.closingValuationStatus) > valuationRank(existing.status)
      ? row.closingValuationStatus
      : existing.status;
    valuations.set(key, {
      quantity: (existing?.quantity ?? 0) + row.closingQuantity,
      lotQuantity: lotQuantities.get(key) ?? 0,
      marketValueAud,
      status,
      date: existing?.date ?? row.closingPriceDate,
    });
  }
  return valuations;
}

function taxableOpenGain(gainAud: number, lot: OpenTaxLot) {
  if (gainAud <= 0) return gainAud;
  return lot.discountEligible ? gainAud * (1 - lot.discountRate) : gainAud;
}

function eofyPricedOpenLots(openLots: OpenTaxLot[], rows: EofyHistoricalCostRow[], endDate: string) {
  const valuations = lotValuationMap(rows, openLots);
  return openLots.map((lot) => {
    const valuation = valuations.get(historicalKey(lot));
    if (!valuation || valuation.marketValueAud == null || valuation.lotQuantity <= 0) {
      return {
        ...lot,
        note: `${lot.note} EOFY market value is missing; using latest current valuation reference.`,
      };
    }

    const marketValueAud = valuation.marketValueAud * (lot.quantity / valuation.lotQuantity);
    const gainAud = marketValueAud - lot.costAud;
    const quantityMismatch = Math.abs(valuation.quantity - valuation.lotQuantity) > 0.000001
      ? ` EOFY quantity ${valuation.quantity.toFixed(6)} differs from tax-lot quantity ${valuation.lotQuantity.toFixed(6)}.`
      : "";
    return {
      ...lot,
      asOfDate: endDate,
      marketValueAud,
      unrealisedGainAud: gainAud,
      unrealisedGainPercent: lot.costAud ? (gainAud / lot.costAud) * 100 : 0,
      taxableGainIfSoldAud: taxableOpenGain(gainAud, lot),
      note: `${lot.note} EOFY valuation ${valuation.status}${valuation.date ? ` from ${valuation.date}` : ""}.${quantityMismatch}`,
    };
  });
}

function unrealisedCgtReport(openLots: OpenTaxLot[]): EofyUnrealisedCgtReport {
  const shortTerm = openLots.filter((lot) => lot.unrealisedGainAud > 0 && !lot.discountEligible);
  const longTerm = openLots.filter((lot) => lot.unrealisedGainAud > 0 && lot.discountEligible);
  const losses = openLots.filter((lot) => lot.unrealisedGainAud < 0);
  return {
    shortTerm,
    longTerm,
    losses,
    summary: {
      shortTermGainsAud: shortTerm.reduce((sum, lot) => sum + lot.unrealisedGainAud, 0),
      longTermGainsAud: longTerm.reduce((sum, lot) => sum + lot.unrealisedGainAud, 0),
      lossesAud: losses.reduce((sum, lot) => sum + lot.unrealisedGainAud, 0),
    },
  };
}

function historyKey(input: Pick<StoredTransaction, "ownerType" | "broker" | "accountKey" | "instrumentKey" | "symbol" | "exchange">) {
  return [
    input.ownerType,
    input.broker,
    input.accountKey,
    input.instrumentKey || `${input.symbol}:${input.exchange}`,
  ].join("|");
}

function buyCostAud(transaction: StoredTransaction) {
  return Math.abs(transactionGrossAud(transaction)) + Math.abs(transactionAud(transaction.fees, transaction)) + Math.abs(transactionAud(transaction.taxes, transaction));
}

function saleProceedsAud(transaction: StoredTransaction) {
  const netCash = Math.abs(transactionNetCashAud(transaction));
  if (netCash) return netCash;
  return Math.max(0, transactionGrossAud(transaction) - Math.abs(transactionAud(transaction.fees, transaction)) - Math.abs(transactionAud(transaction.taxes, transaction)));
}

type HistoricalLot = {
  quantity: number;
  costPerUnitAud: number;
};

type HistoricalAccumulator = {
  market: string;
  code: string;
  name: string;
  allocationMethod: string;
  lots: HistoricalLot[];
  openingBalanceAud: number;
  openingQuantity: number;
  purchasesAud: number;
  costOfSalesAud: number;
  capitalAdjustmentsAud: number;
};

function historicalAccumulator(transaction: StoredTransaction): HistoricalAccumulator {
  return {
    market: transaction.exchange,
    code: transaction.symbol,
    name: transaction.description || transaction.symbol,
    allocationMethod: "FIFO",
    lots: [],
    openingBalanceAud: 0,
    openingQuantity: 0,
    purchasesAud: 0,
    costOfSalesAud: 0,
    capitalAdjustmentsAud: 0,
  };
}

function lotTotals(lots: HistoricalLot[]) {
  return lots.reduce((total, lot) => ({
    quantity: total.quantity + lot.quantity,
    costAud: total.costAud + lot.quantity * lot.costPerUnitAud,
  }), { quantity: 0, costAud: 0 });
}

function applyHistoricalTransaction(row: HistoricalAccumulator, transaction: StoredTransaction) {
  const quantity = Math.abs(transaction.quantity ?? 0);
  if (!quantity) return 0;

  if (transaction.type === "BUY") {
    const costAud = buyCostAud(transaction);
    row.lots.push({ quantity, costPerUnitAud: quantity ? costAud / quantity : 0 });
    return 0;
  }

  let remaining = quantity;
  let costOfSalesAud = 0;
  for (const lot of row.lots) {
    if (remaining <= 0) break;
    if (lot.quantity <= 0) continue;
    const matchedQuantity = Math.min(lot.quantity, remaining);
    costOfSalesAud += matchedQuantity * lot.costPerUnitAud;
    lot.quantity -= matchedQuantity;
    remaining -= matchedQuantity;
  }

  if (remaining > 0) {
    const proceedsAud = saleProceedsAud(transaction) * (remaining / quantity);
    const realisedAud = transactionAud(transaction.realisedPnl, transaction) * (remaining / quantity);
    costOfSalesAud += Math.max(0, proceedsAud - realisedAud);
  }

  row.lots = row.lots.filter((lot) => lot.quantity > 0.000001);
  return costOfSalesAud;
}

function historicalCostRows(transactions: StoredTransaction[], startDate: string, endDate: string, priceBook?: PriceBook): EofyHistoricalCostRow[] {
  const rows = new Map<string, HistoricalAccumulator>();
  const sorted = [...transactions]
    .filter((transaction) => transaction.type === "BUY" || transaction.type === "SELL")
    .filter((transaction) => transaction.tradeDate <= endDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.externalId.localeCompare(b.externalId));

  for (const transaction of sorted) {
    const key = historyKey(transaction);
    const row = rows.get(key) ?? historicalAccumulator(transaction);
    if (transaction.tradeDate < startDate) {
      applyHistoricalTransaction(row, transaction);
      const opening = lotTotals(row.lots);
      row.openingBalanceAud = opening.costAud;
      row.openingQuantity = opening.quantity;
      rows.set(key, row);
      continue;
    }

    if (transaction.type === "BUY") {
      row.purchasesAud += buyCostAud(transaction);
      applyHistoricalTransaction(row, transaction);
    } else {
      row.costOfSalesAud += applyHistoricalTransaction(row, transaction);
    }
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => {
      const closing = lotTotals(row.lots);
      const baseRow = {
        market: row.market,
        code: row.code,
        name: row.name,
        allocationMethod: row.allocationMethod,
        openingBalanceAud: row.openingBalanceAud,
        openingMarketValueAud: null,
        openingQuantity: row.openingQuantity,
        purchasesAud: row.purchasesAud,
        costOfSalesAud: row.costOfSalesAud,
        capitalAdjustmentsAud: row.capitalAdjustmentsAud,
        closingBalanceAud: closing.costAud,
        closingQuantity: closing.quantity,
      };
      return {
        ...baseRow,
        ...historicalValuation(baseRow, priceBook, endDate),
      };
    })
    .filter((row) => row.openingBalanceAud || row.purchasesAud || row.costOfSalesAud || row.closingBalanceAud || row.openingQuantity || row.closingQuantity)
    .sort((a, b) => a.market.localeCompare(b.market) || a.code.localeCompare(b.code));
}

function dataQualityNotes(report: {
  incomePayments: EofyIncomePayment[];
  realisedLots: RealisedTaxLot[];
  currentHoldings: EofyHoldingReference[];
  historicalCost: EofyHistoricalCostRow[];
  valuationAsOf: string | null;
}) {
  const notes = [
    "Prepared from imported NorthStar broker transactions and dividend notifications. Accountant should verify against broker statements.",
    "Current holdings are included as a reconciliation reference using the latest available valuation, not a reconstructed 30 June historical valuation.",
  ];
  const missingPrices = report.historicalCost.filter((row) => row.closingValuationStatus === "missing_price").length;
  const missingFx = report.historicalCost.filter((row) => row.closingValuationStatus === "missing_fx").length;
  const priorCloses = report.historicalCost.filter((row) => row.closingValuationStatus === "prior_close").length;

  if (!report.incomePayments.length) notes.push("No dividend or distribution income is stored for this financial year and owner scope.");
  if (!report.realisedLots.length) notes.push("No realised sale lots are stored for this financial year and owner scope.");
  if (report.realisedLots.some((lot) => lot.acquisitionDate == null)) notes.push("Some sale lots are missing acquisition history and use broker realised P/L or an incomplete cost-base estimate.");
  if (report.currentHoldings.some((holding) => holding.source === "position_fallback")) notes.push("Some open holding cost bases use current position fallback data because complete transaction history is not yet available.");
  if (priorCloses) notes.push(`${priorCloses} historical-cost row${priorCloses === 1 ? "" : "s"} use the latest stored close before 30 June because an exact 30 June price was not stored.`);
  if (missingPrices || missingFx) notes.push(`${missingPrices + missingFx} historical-cost row${missingPrices + missingFx === 1 ? "" : "s"} need price or FX backfill before the 30 June market-value column is complete.`);
  if (!report.valuationAsOf) notes.push("No valuation date is recorded for the current open-position reference.");

  return notes;
}

export function buildEofyReport(scope: EofyScope, dashboard: DashboardData, transactions: StoredTransaction[], year: number, generatedAt = new Date(), priceBook?: PriceBook): EofyReport {
  const fy = financialYear(year);
  const transactionsThroughEofy = transactions.filter((transaction) => transaction.tradeDate <= fy.endDate);
  const income = incomeRows(transactions, fy.startDate, fy.endDate);
  const taxableIncome = taxableIncomeRows(transactions, fy.startDate, fy.endDate);
  const taxLotDashboard = { ...dashboard, lastUpdated: fy.endDate };
  const allTaxLots = buildTaxLots(taxLotDashboard, transactionsThroughEofy, generatedAt);
  const realisedLots = allTaxLots.realisedLots.filter((lot) => dateInRange(lot.saleDate, fy.startDate, fy.endDate));
  const tradeMovements = tradeRows(transactions, fy.startDate, fy.endDate);
  const currentHoldings = dashboard.holdings
    .filter((holding) => holding.marketValueAud || holding.costAud || holding.quantity)
    .map(holdingReference)
    .sort((a, b) => b.marketValueAud - a.marketValueAud);
  const realised = realisedSummary(realisedLots);
  const capitalGains = capitalGainsReport(scope, realisedLots);
  const historicalCost = historicalCostRows(transactionsThroughEofy, fy.startDate, fy.endDate, priceBook);
  const eofyOpenLots = eofyPricedOpenLots(allTaxLots.openLots, historicalCost, fy.endDate);
  const unrealisedCgt = unrealisedCgtReport(eofyOpenLots);
  const buyTrades = tradeMovements.filter((trade) => trade.type === "BUY");
  const sellTrades = tradeMovements.filter((trade) => trade.type === "SELL");
  const draftReport = {
    incomePayments: income.payments,
    realisedLots,
    currentHoldings,
    historicalCost,
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
      taxableRealisedAud: capitalGains.summary.netCapitalGainAud,
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
    taxableIncome,
    capitalGains,
    realisedLots,
    unrealisedCgt,
    historicalCost,
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

function addSharesightCompatibilityRows(rows: CsvRow[], report: EofyReport) {
  const cgt = report.capitalGains.summary;
  const cgtSummaryRows: Array<[string, number, string]> = [
    ["Short term capital gains", cgt.shortTermGainsAud, "Capital gains on shares applicable for 'other' method"],
    ["Long term capital gains", cgt.longTermGainsAud, "Capital gains on shares applicable for discount method"],
    ["Capital losses available to offset", cgt.lossesAud, "Current-year realised capital losses"],
    ["Total current year capital gains (18H)", cgt.totalCurrentYearCapitalGainsAud, "Sharesight-style 18H total before losses and discount"],
    ["Short term gains after losses", cgt.shortTermGainsAfterLossesAud, "Losses offset against short-term gains first"],
    ["Long term gains after losses", cgt.longTermGainsAfterLossesAud, "Remaining long-term gains before concession"],
    [`Less CGT concession amount at ${Math.round(cgt.discountRate * 100)}%`, -cgt.cgtConcessionAud, "Discount applied after loss offset"],
    ["Total net capital gain (18A)", cgt.netCapitalGainAud, "Sharesight-style 18A net capital gain"],
  ];

  for (const [label, value, detail] of cgtSummaryRows) {
    rows.push([
      "sharesight_cgt_summary",
      report.ownerLabel,
      report.financialYear.label,
      label,
      "",
      "",
      report.financialYear.startDate,
      report.financialYear.endDate,
      "",
      "AUD",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      money(value),
      label.includes("18A") ? money(value) : "",
      detail,
      report.financialYear.endDate,
    ]);
  }

  for (const row of report.capitalGains.byHolding) {
    rows.push([
      "sharesight_cgt_all_holdings",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.code,
      row.market,
      "",
      "",
      number(row.soldQuantity),
      "AUD",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      money(row.totalGainAud + row.lossesAud),
      "",
      `Short term ${money(row.shortTermGainsAud)}; long term ${money(row.longTermGainsAud)}; losses ${money(row.lossesAud)}; total gains ${money(row.totalGainAud)}`,
      report.financialYear.endDate,
    ]);
  }

  for (const row of report.taxableIncome.australianNonTrust) {
    rows.push([
      "sharesight_taxable_income_au_non_trust",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.code,
      "",
      row.paidDate,
      "",
      "",
      "AUD",
      money(row.totalIncomeAud),
      money(row.netAmountAud),
      money(row.frankingCreditsAud),
      money(row.foreignIncomeTaxAud + row.tfnWithholdingAud),
      "",
      "",
      "",
      "",
      "",
      `Franked ${money(row.frankedAmountAud)}; unfranked ${money(row.unfrankedAmountAud)}; tax deferred ${money(row.taxDeferredAud)}; gross dividend ${money(row.grossDividendAud)}; ${row.comments}`,
      row.paidDate,
    ]);
  }

  for (const row of report.taxableIncome.australianTrust) {
    rows.push([
      "sharesight_taxable_income_au_trust",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.code,
      "",
      row.paidDate,
      "",
      "",
      "AUD",
      money(row.totalIncomeAud),
      money(row.netAmountAud),
      money(row.frankingCreditsAud),
      money(row.foreignIncomeTaxAud + row.tfnWithholdingAud),
      "",
      money(row.amitCostBaseDecreaseAud - row.amitCostBaseIncreaseAud),
      "",
      money(row.capitalGainsAud + row.discountedCapitalGainsAud),
      "",
      `Franked ${money(row.frankedAmountAud)}; unfranked ${money(row.unfrankedAmountAud)}; AMIT decrease ${money(row.amitCostBaseDecreaseAud)}; AMIT increase ${money(row.amitCostBaseIncreaseAud)}; gross dividend ${money(row.grossDividendAud)}; ${row.comments}`,
      row.paidDate,
    ]);
  }

  for (const row of report.taxableIncome.foreign) {
    rows.push([
      "sharesight_taxable_income_foreign",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.code,
      "",
      row.paidDate,
      "",
      "",
      row.currency,
      money(row.grossAmountAud),
      money(row.netAmountAud),
      "",
      money(row.foreignTaxWithheldAud),
      "",
      "",
      "",
      "",
      "",
      `Country ${row.country}; exchange rate ${row.exchangeRate ?? ""}; ${row.incomeType}; ${row.comments}`,
      row.paidDate,
    ]);
  }

  for (const row of report.historicalCost) {
    rows.push([
      "sharesight_historical_cost",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.code,
      row.market,
      report.financialYear.startDate,
      report.financialYear.endDate,
      number(row.closingQuantity),
      "AUD",
      "",
      "",
      "",
      "",
      "",
      money(row.closingBalanceAud),
      row.closingMarketValueAud == null ? "" : money(row.closingMarketValueAud),
      "",
      "",
      `Method ${row.allocationMethod}; opening balance ${money(row.openingBalanceAud)}; opening quantity ${number(row.openingQuantity)}; purchases ${money(row.purchasesAud)}; cost of sales ${money(row.costOfSalesAud)}; capital adjustments ${money(row.capitalAdjustmentsAud)}; closing quantity ${number(row.closingQuantity)}; valuation ${row.closingValuationStatus}; price ${number(row.closingPrice)} ${row.closingPriceCurrency ?? ""} on ${row.closingPriceDate ?? ""}; FX ${number(row.closingFxRateToAud)}; source ${row.closingValuationSource ?? ""}`,
      report.financialYear.endDate,
    ]);
  }

  const unrealisedBuckets: Array<[string, OpenTaxLot[]]> = [
    ["sharesight_unrealised_cgt_short_term", report.unrealisedCgt.shortTerm],
    ["sharesight_unrealised_cgt_long_term", report.unrealisedCgt.longTerm],
    ["sharesight_unrealised_cgt_losses", report.unrealisedCgt.losses],
  ];
  for (const [section, lots] of unrealisedBuckets) {
    for (const lot of lots) {
      rows.push([
        section,
        report.ownerLabel,
        report.financialYear.label,
        lot.name,
        lot.symbol,
        lot.exchange,
        lot.acquisitionDate,
        "",
        number(lot.quantity),
        "AUD",
        "",
        "",
        "",
        "",
        "",
        money(lot.costAud),
        money(lot.marketValueAud),
        money(lot.unrealisedGainAud),
        money(lot.taxableGainIfSoldAud),
        `${lot.source}; held ${lot.heldDays ?? "unknown"} days; ${lot.discountEligible ? "discount eligible" : "not discount eligible"}; ${lot.note}`,
        lot.asOfDate,
      ]);
    }
  }
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

  addSharesightCompatibilityRows(rows, report);

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
