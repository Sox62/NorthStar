import type { RealisedTaxLot } from "@/lib/tax-lots";
import type { EofyHistoricalCostRow, EofyHoldingReference, EofyIncomePayment } from "./types";

export function dataQualityNotes(report: {
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
