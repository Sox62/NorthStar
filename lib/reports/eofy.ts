import { defaultParcelSelectionMethod, type ParcelSelection } from "@/lib/parcel-selection";
import { buildTaxLots, reconcileTrades, type TaxTreatment } from "@/lib/tax-lots";
import { taxJurisdiction } from "@/lib/tax-jurisdictions";
import type { DashboardData, DashboardHolding, PriceBook, StoredTransaction } from "@/lib/storage";
import { accountSummaries } from "./eofy/accounts";
import { capitalGainsReport, eofyPricedOpenLots, realisedSummary, unrealisedCgtReport } from "./eofy/cgt";
import { dataQualityNotes } from "./eofy/data-quality";
import { eofyReportCsv } from "./eofy/csv";
import { historicalCostRows, yearEndPositions } from "./eofy/historical-cost";
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

export function buildEofyReport(scope: EofyScope, dashboard: DashboardData, transactions: StoredTransaction[], year: number, generatedAt = new Date(), priceBook?: PriceBook, treatment: TaxTreatment = { pensionPhase: false }, selection: ParcelSelection = { method: defaultParcelSelectionMethod }): EofyReport {
  const fy = financialYear(year);
  const jurisdiction = taxJurisdiction("AU");
  const transactionsThroughEofy = transactions.filter((transaction) => transaction.tradeDate <= fy.endDate);
  const income = incomeRows(transactions, fy.startDate, fy.endDate);
  const taxableIncome = taxableIncomeRows(transactions, fy.startDate, fy.endDate);
  /*
   * The open lots are built from what the trades say was held at 30 June, not from what is held
   * today. Passing current holdings meant a position sold in August reported the year-end value of
   * two units spread over the one still held, and a holding sold out entirely disappeared from a
   * schedule whose whole purpose is to show what was owned at year end.
   */
  const reconciledThroughEofy = reconcileTrades(transactionsThroughEofy);
  const closingPositions = yearEndPositions(reconciledThroughEofy, fy.endDate, selection);
  const byInstrument = new Map(dashboard.holdings.map((holding) => [`${holding.symbol}:${holding.exchange}`.toUpperCase(), holding]));
  const closingHoldings = closingPositions.map((position) => {
    const current = byInstrument.get(`${position.symbol}:${position.exchange}`.toUpperCase());
    return {
      ...(current ?? {}),
      id: `eofy:${position.instrumentKey}`,
      ownerType: position.ownerType,
      broker: position.broker,
      accountKey: position.accountKey,
      symbol: position.symbol,
      exchange: position.exchange,
      instrumentKey: position.instrumentKey,
      name: position.name,
      quantity: position.quantity,
      costAud: position.costAud,
      averageCostAud: position.quantity ? position.costAud / position.quantity : 0,
      // Repriced to 30 June from the historical schedule further down; cost stands in until then,
      // so an unpriced holding reads as no gain rather than as an invented one.
      marketValueAud: position.costAud,
    } as DashboardHolding;
  });
  const taxLotDashboard = { ...dashboard, lastUpdated: fy.endDate, holdings: closingHoldings };
  const allTaxLots = buildTaxLots(taxLotDashboard, transactionsThroughEofy, generatedAt, treatment, selection);
  const realisedLots = allTaxLots.realisedLots.filter((lot) => dateInRange(lot.saleDate, fy.startDate, fy.endDate));
  /*
   * Every schedule in this pack is built from the trades the engine actually counted, not from the
   * raw rows. Reading the raw rows is what let one trade carried by two exports become four trade
   * movements and double a historical purchase while the CGT beside it correctly counted one.
   */
  const reconciled = allTaxLots.reconciledTransactions;
  const tradeMovements = tradeRows(reconciled, fy.startDate, fy.endDate);
  const currentHoldings = dashboard.holdings
    .filter((holding) => holding.marketValueAud || holding.costAud || holding.quantity)
    .map(holdingReference)
    .sort((a, b) => b.marketValueAud - a.marketValueAud);
  const realised = realisedSummary(realisedLots);
  const capitalGains = capitalGainsReport(scope, realisedLots, treatment);
  const historicalCost = historicalCostRows(reconciled, fy.startDate, fy.endDate, priceBook, selection);
  const eofyOpenLots = eofyPricedOpenLots(allTaxLots.openLots, historicalCost, fy.endDate, treatment);
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
    unappliedActions: allTaxLots.unappliedActions,
    duplicates: allTaxLots.duplicates,
    nearDuplicates: allTaxLots.near,
    missingFx: allTaxLots.missingFx,
  };

  return {
    scope,
    ownerType: ownerTypeForEofyScope(scope),
    ownerLabel: ownerLabelForEofyScope(scope),
    taxJurisdictionCode: jurisdiction.code,
    taxJurisdiction: jurisdiction,
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
