import type { DuplicateTradeWarning, RealisedTaxLot, UnappliedCorporateAction } from "@/lib/tax-lots";
import type { EofyHistoricalCostRow, EofyHoldingReference, EofyIncomePayment } from "./types";

export function dataQualityNotes(report: {
  incomePayments: EofyIncomePayment[];
  realisedLots: RealisedTaxLot[];
  currentHoldings: EofyHoldingReference[];
  historicalCost: EofyHistoricalCostRow[];
  valuationAsOf: string | null;
  unappliedActions?: UnappliedCorporateAction[];
  duplicates?: DuplicateTradeWarning[];
  nearDuplicates?: DuplicateTradeWarning[];
}) {
  const notes = [
    "Prepared from imported SouthernStar broker transactions and dividend notifications. Accountant should verify against broker statements.",
    "Current holdings are included as a reconciliation reference using the latest available valuation, not a reconstructed 30 June historical valuation.",
  ];
  const missingPrices = report.historicalCost.filter((row) => row.closingValuationStatus === "missing_price").length;
  const missingFx = report.historicalCost.filter((row) => row.closingValuationStatus === "missing_fx").length;
  const priorCloses = report.historicalCost.filter((row) => row.closingValuationStatus === "prior_close").length;

  if (!report.incomePayments.length) notes.push("No dividend or distribution income is stored for this financial year and owner scope.");
  if (!report.realisedLots.length) notes.push("No realised sale lots are stored for this financial year and owner scope.");
  /*
   * Quantified rather than hinted at. The old note said "some sale lots" without saying how many or
   * what they were worth, which is not enough to act on: BOE's unmatched 6,363 units were a $10,668
   * loss that never reached the return.
   */
  const unmatched = report.realisedLots.filter((lot) => lot.acquisitionDate == null);
  if (unmatched.length) {
    const symbols = [...new Set(unmatched.map((lot) => lot.symbol))].sort();
    const proceeds = unmatched.reduce((sum, lot) => sum + lot.proceedsAud, 0);
    notes.push(
      `${unmatched.length} disposal${unmatched.length === 1 ? "" : "s"} could not be matched to an acquisition `
      + `(${symbols.join(", ")}), covering ${proceeds.toFixed(2)} of proceeds. Their gain is reported as nil, `
      + "so the capital gain or loss on them is missing from this report rather than merely uncertain.",
    );
  }
  if (report.currentHoldings.some((holding) => holding.source === "position_fallback")) notes.push("Some open holding cost bases use current position fallback data because complete transaction history is not yet available.");
  if (priorCloses) notes.push(`${priorCloses} historical-cost row${priorCloses === 1 ? "" : "s"} use the latest stored close before 30 June because an exact 30 June price was not stored.`);
  if (missingPrices || missingFx) notes.push(`${missingPrices + missingFx} historical-cost row${missingPrices + missingFx === 1 ? "" : "s"} need price or FX backfill before the 30 June market-value column is complete.`);
  if (!report.valuationAsOf) notes.push("No valuation date is recorded for the current open-position reference.");

  /*
   * A corporate action the engine could not apply leaves a cost base wrong by the whole ratio, and
   * says so nowhere else. This is the note that would have caught VAU's consolidation at the time
   * rather than a year later during a reconciliation.
   */
  const duplicates = report.duplicates ?? [];
  if (duplicates.length) {
    const symbols = [...new Set(duplicates.map((row) => row.symbol))].sort();
    notes.push(
      `${duplicates.length} trade${duplicates.length === 1 ? "" : "s"} appeared in more than one export and `
      + `${duplicates.length === 1 ? "was" : "were"} counted once rather than twice (${symbols.join(", ")}). `
      + "Brokers stamp a different id in each export, so these cannot be de-duplicated on import.",
    );
  }

  /*
   * Reported rather than merged. A pair differing only by a day is indistinguishable from two
   * genuine trades, and merging on a guess would delete a real disposal.
   */
  for (const row of report.nearDuplicates ?? []) {
    notes.push(
      `${row.symbol} ${row.type} of ${row.quantity} on ${row.tradeDate} may be one trade recorded twice: ${row.reason}. `
      + "Both have been kept; check the contract note before relying on this holding's cost base.",
    );
  }

  for (const action of report.unappliedActions ?? []) {
    notes.push(
      `${action.symbol} ${action.description} on ${action.tradeDate} could not be applied (${action.reason}); `
      + "its cost base per unit is unadjusted and any gain on it will be wrong.",
    );
  }

  return notes;
}
