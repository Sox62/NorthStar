import { buildTaxLots } from "@/lib/tax-lots";
import type { DashboardData, PriceBook, StoredTransaction } from "@/lib/storage";
import { accountSummaries } from "./eofy/accounts";
import { capitalGainsReport, eofyPricedOpenLots, realisedSummary, unrealisedCgtReport } from "./eofy/cgt";
import { dataQualityNotes } from "./eofy/data-quality";
import { eofyReportCsv } from "./eofy/csv";
import { historicalCostRows } from "./eofy/historical-cost";
import { incomeRows, taxableIncomeRows } from "./eofy/income";
import { eofyReconciliationReport } from "./eofy/reconciliation";
import { holdingReference, tradeRows } from "./eofy/trades";
import type { EofyReport, EofyScope } from "./eofy/types";
import { dateInRange, financialYear, financialYearFromRequest, ownerLabelForEofyScope, ownerTypeForEofyScope } from "./eofy/utils";

export type {
  EofyAustralianIncomeRow,
  EofyAccountSummary,
  EofyCapitalGainsHolding,
  EofyCapitalGainsReport,
  EofyForeignIncomeRow,
  EofyHistoricalCostRow,
  EofyHoldingReference,
  EofyIncomePayment,
  EofyIncomeSymbol,
  EofyReconciliationReport,
  EofyReconciliationRow,
  EofyReconciliationStatus,
  EofyReport,
  EofyScope,
  EofyTaxableIncomeSections,
  EofyTradeMovement,
  EofyUnrealisedCgtReport,
  EofyValuationStatus,
} from "./eofy/types";
export { eofyReportCsv } from "./eofy/csv";
export { financialYear, financialYearFromRequest, ownerLabelForEofyScope, ownerTypeForEofyScope } from "./eofy/utils";

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
  const summary = {
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
  };
  const reconciliation = eofyReconciliationReport({
    summary,
    incomePayments: income.payments,
    capitalGains,
    realisedLots,
    historicalCost,
    tradeMovements,
    currentHoldings,
  });
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
    summary,
    accountSummaries: accountSummaries(tradeMovements, income.payments, currentHoldings),
    incomeBySymbol: income.symbols,
    incomePayments: income.payments,
    taxableIncome,
    capitalGains,
    realisedLots,
    unrealisedCgt,
    historicalCost,
    tradeMovements,
    currentHoldings,
    reconciliation,
    dataQuality: dataQualityNotes(draftReport),
  };
}
