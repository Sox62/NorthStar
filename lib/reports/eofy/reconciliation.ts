import type { RealisedTaxLot } from "@/lib/tax-lots";
import type {
  EofyCapitalGainsReport,
  EofyHistoricalCostRow,
  EofyHoldingReference,
  EofyIncomePayment,
  EofyReconciliationReport,
  EofyReconciliationRow,
  EofyReconciliationStatus,
  EofyReport,
  EofyTradeMovement,
} from "./types";

const varianceToleranceAud = 0.01;

type ReconciliationInput = {
  summary: EofyReport["summary"];
  incomePayments: EofyIncomePayment[];
  capitalGains: EofyCapitalGainsReport;
  realisedLots: RealisedTaxLot[];
  historicalCost: EofyHistoricalCostRow[];
  tradeMovements: EofyTradeMovement[];
  currentHoldings: EofyHoldingReference[];
};

function sum<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function statusForVariance(varianceAud: number): EofyReconciliationStatus {
  return Math.abs(varianceAud) <= varianceToleranceAud ? "ok" : "review";
}

function amountRow(section: string, check: string, reportedAud: number, referenceAud: number, detail: string): EofyReconciliationRow {
  const varianceAud = reportedAud - referenceAud;
  return {
    section,
    check,
    reportedAud,
    referenceAud,
    varianceAud,
    status: statusForVariance(varianceAud),
    detail,
  };
}

function reviewRow(section: string, check: string, status: EofyReconciliationStatus, detail: string): EofyReconciliationRow {
  return {
    section,
    check,
    reportedAud: null,
    referenceAud: null,
    varianceAud: null,
    status,
    detail,
  };
}

export function eofyReconciliationReport(input: ReconciliationInput): EofyReconciliationReport {
  const buyTrades = input.tradeMovements.filter((row) => row.type === "BUY");
  const sellTrades = input.tradeMovements.filter((row) => row.type === "SELL");
  const openingCostAud = sum(input.historicalCost, (row) => row.openingBalanceAud);
  const purchasesAud = sum(input.historicalCost, (row) => row.purchasesAud);
  const costOfSalesAud = sum(input.historicalCost, (row) => row.costOfSalesAud);
  const capitalAdjustmentsAud = sum(input.historicalCost, (row) => row.capitalAdjustmentsAud);
  const closingCostAud = sum(input.historicalCost, (row) => row.closingBalanceAud);
  const expectedClosingCostAud = openingCostAud + purchasesAud - costOfSalesAud + capitalAdjustmentsAud;
  const realisedProceedsAud = sum(input.realisedLots, (row) => row.proceedsAud);
  const realisedCostAud = sum(input.realisedLots, (row) => row.costAud);
  const realisedNetAud = sum(input.realisedLots, (row) => row.realisedGainAud);
  const missingPriceRows = input.historicalCost.filter((row) => row.closingValuationStatus === "missing_price").length;
  const missingFxRows = input.historicalCost.filter((row) => row.closingValuationStatus === "missing_fx").length;
  const missingAcquisitionRows = input.realisedLots.filter((row) => row.acquisitionDate == null).length;

  const rows: EofyReconciliationRow[] = [
    amountRow(
      "Income",
      "Gross income subtotal",
      input.summary.grossIncomeAud,
      sum(input.incomePayments, (row) => row.grossIncomeAud),
      "Summary gross income should equal the stored dividend/distribution payment detail.",
    ),
    amountRow(
      "Income",
      "Net income subtotal",
      input.summary.netIncomeAud,
      sum(input.incomePayments, (row) => row.netIncomeAud),
      "Summary net income should equal the stored dividend/distribution payment detail.",
    ),
    amountRow(
      "Income",
      "Franking credits subtotal",
      input.summary.frankingCreditsAud,
      sum(input.incomePayments, (row) => row.frankingCreditsAud),
      "Summary franking credits should equal the payment detail extracted from income notices.",
    ),
    amountRow(
      "Trades",
      "Buy trade cost subtotal",
      input.summary.buysAud,
      sum(buyTrades, (row) => row.grossAud + row.feesAud + row.taxesAud),
      "Buy cost total should equal the buy rows in the trade movement schedule.",
    ),
    amountRow(
      "Trades",
      "Sell trade proceeds subtotal",
      input.summary.sellsAud,
      sum(sellTrades, (row) => Math.abs(row.netCashAud || row.grossAud)),
      "Sell proceeds total should equal the sell rows in the trade movement schedule.",
    ),
    amountRow(
      "CGT",
      "Realised proceeds subtotal",
      input.summary.sellsAud,
      realisedProceedsAud,
      "Sell proceeds should tie to the realised CGT lot proceeds after lot splitting.",
    ),
    amountRow(
      "CGT",
      "Realised cost base subtotal",
      costOfSalesAud,
      realisedCostAud,
      "Historical cost-of-sales should tie to realised CGT lot cost bases.",
    ),
    amountRow(
      "CGT",
      "Net realised subtotal",
      input.summary.netRealisedAud,
      realisedNetAud,
      "Net realised gain/loss should equal realised proceeds less realised cost base.",
    ),
    amountRow(
      "CGT",
      "Taxable net capital gain",
      input.summary.taxableRealisedAud,
      input.capitalGains.summary.netCapitalGainAud,
      "Taxable realised CGT should equal the 18A net capital gain after loss offset and discount.",
    ),
    amountRow(
      "Historical cost",
      "Closing cost movement",
      closingCostAud,
      expectedClosingCostAud,
      "Closing historical cost should equal opening cost plus purchases less cost of sales plus adjustments.",
    ),
    amountRow(
      "Open positions",
      "Latest open cost reference",
      input.summary.currentCostBaseAud,
      closingCostAud,
      "Informational: latest open-position cost reference compared with the EOFY historical closing cost.",
    ),
    reviewRow(
      "Data completeness",
      "Missing EOFY price or FX rows",
      missingPriceRows || missingFxRows ? "review" : "ok",
      missingPriceRows || missingFxRows
        ? `${missingPriceRows} row${missingPriceRows === 1 ? "" : "s"} missing EOFY price and ${missingFxRows} row${missingFxRows === 1 ? "" : "s"} missing FX.`
        : "All historical-cost rows have enough stored price and FX data for EOFY market value.",
    ),
    reviewRow(
      "Data completeness",
      "Missing acquisition history",
      missingAcquisitionRows ? "review" : "ok",
      missingAcquisitionRows
        ? `${missingAcquisitionRows} realised CGT lot${missingAcquisitionRows === 1 ? "" : "s"} need acquisition history review.`
        : "All realised CGT lots have acquisition dates.",
    ),
  ];

  const rowsWithCurrentReferenceInfo = rows.map((row) =>
    row.section === "Open positions" ? { ...row, status: "info" as const } : row
  );
  const status = rowsWithCurrentReferenceInfo.some((row) => row.status === "review") ? "review" : "ok";

  return {
    status,
    varianceToleranceAud,
    rows: rowsWithCurrentReferenceInfo,
  };
}
