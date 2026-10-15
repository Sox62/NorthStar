import { discountRateForOwner, taxableGainForTreatment, type OpenTaxLot, type RealisedTaxLot, type TaxTreatment } from "@/lib/tax-lots";
import type { EofyCapitalGainsHolding, EofyCapitalGainsReport, EofyHistoricalCostRow, EofyScope, EofyUnrealisedCgtReport, EofyValuationStatus } from "./types";
import { historicalKey } from "./valuation";
import { ownerTypeForEofyScope } from "./utils";

export function realisedSummary(lots: RealisedTaxLot[]) {
  const realisedGainsAud = lots.reduce((sum, lot) => lot.realisedGainAud > 0 ? sum + lot.realisedGainAud : sum, 0);
  const realisedLossesAud = lots.reduce((sum, lot) => lot.realisedGainAud < 0 ? sum + Math.abs(lot.realisedGainAud) : sum, 0);
  return {
    realisedGainsAud,
    realisedLossesAud,
    netRealisedAud: realisedGainsAud - realisedLossesAud,
    taxableRealisedAud: lots.reduce((sum, lot) => sum + lot.taxableGainAud, 0),
  };
}

/**
 * The rate comes from the engine rather than a literal here, so a fund gets a third and an
 * individual a half from one place. `EofyScope` is currently "personal" only — the pack is
 * deliberately personal-only and the route refuses anything else — so this resolves to a half
 * today; widening the scope will route through the same rule rather than a second copy of it.
 */
function capitalGainDiscountRate(scope: EofyScope) {
  return discountRateForOwner(ownerTypeForEofyScope(scope));
}

export function capitalGainsReport(scope: EofyScope, realisedLots: RealisedTaxLot[], treatment: TaxTreatment): EofyCapitalGainsReport {
  /*
   * A disposal whose acquisition could not be reconstructed carries a gain of exactly zero, and the
   * three filters below ask for > 0, > 0 and < 0 — so it fell through all of them and vanished from
   * the report entirely. Twenty-six disposals were missing this way, BOE's 6,363 units among them,
   * each one a real CGT event reported as though it had not happened. Zero-gain disposals are now
   * carried in the non-discounted bucket, where they add nothing to the totals but are visible, and
   * the data-quality notes count them.
   */
  const shortTerm = realisedLots.filter((lot) => lot.realisedGainAud >= 0 && !lot.discountEligible);
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
      // Exempt current pension income: the fund's net capital gain is nil however the gains and
      // losses inside it net off, so the figure is zeroed here rather than discounted.
      netCapitalGainAud: treatment.pensionPhase
        ? 0
        : shortTermGainsAfterLossesAud + longTermGainsAfterLossesAud - cgtConcessionAud,
      discountRate,
    },
    byHolding: [...byHolding.values()].sort((a, b) => b.totalGainAud + b.lossesAud - (a.totalGainAud + a.lossesAud)),
    shortTerm: shortTerm.sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.symbol.localeCompare(b.symbol)),
    longTerm: longTerm.sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.symbol.localeCompare(b.symbol)),
    losses: losses.sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.symbol.localeCompare(b.symbol)),
  };
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

/**
 * Repricing a lot to the year end changes its gain, so the taxable figure has to be recomputed —
 * but through the engine's own rule, not a copy of it. The copy had no tax treatment in scope and
 * so overwrote an exempt zero with a taxable number on every SMSF lot it touched.
 */
function taxableOpenGain(gainAud: number, lot: OpenTaxLot, treatment: TaxTreatment) {
  return taxableGainForTreatment(gainAud, lot.discountEligible, lot.discountRate, treatment);
}

export function eofyPricedOpenLots(openLots: OpenTaxLot[], rows: EofyHistoricalCostRow[], endDate: string, treatment: TaxTreatment) {
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
      taxableGainIfSoldAud: taxableOpenGain(gainAud, lot, treatment),
      note: `${lot.note} EOFY valuation ${valuation.status}${valuation.date ? ` from ${valuation.date}` : ""}.${quantityMismatch}`,
    };
  });
}

export function unrealisedCgtReport(openLots: OpenTaxLot[]): EofyUnrealisedCgtReport {
  /*
   * Every lot lands in exactly one bucket. Splitting on `> 0` and `< 0` left a lot sitting at
   * precisely nil in none of them, so a holding whose year-end price is unavailable — valued at its
   * own cost, and therefore showing no gain — disappeared from a schedule of what was held. The
   * realised side had the same gap and the same fix.
   */
  const shortTerm = openLots.filter((lot) => lot.unrealisedGainAud >= 0 && !lot.discountEligible);
  const longTerm = openLots.filter((lot) => lot.unrealisedGainAud >= 0 && lot.discountEligible);
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
