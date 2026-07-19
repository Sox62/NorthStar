import type { OpenTaxLot, RealisedTaxLot } from "@/lib/tax-lots";
import type { OwnerType } from "@/lib/storage";

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
  reconciliation: EofyReconciliationReport;
  dataQuality: string[];
};

export type EofyReconciliationStatus = "ok" | "review" | "info";

export type EofyReconciliationRow = {
  section: string;
  check: string;
  reportedAud: number | null;
  referenceAud: number | null;
  varianceAud: number | null;
  status: EofyReconciliationStatus;
  detail: string;
};

export type EofyReconciliationReport = {
  status: EofyReconciliationStatus;
  varianceToleranceAud: number;
  rows: EofyReconciliationRow[];
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
