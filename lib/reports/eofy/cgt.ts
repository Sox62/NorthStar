import type { OpenTaxLot, RealisedTaxLot } from "@/lib/tax-lots";
import type { EofyCapitalGainsHolding, EofyCapitalGainsReport, EofyHistoricalCostRow, EofyScope, EofyUnrealisedCgtReport, EofyValuationStatus } from "./types";
import { historicalKey } from "./valuation";

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

function capitalGainDiscountRate(_scope: EofyScope) {
  return 0.5;
}

export function capitalGainsReport(scope: EofyScope, realisedLots: RealisedTaxLot[]): EofyCapitalGainsReport {
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

export function eofyPricedOpenLots(openLots: OpenTaxLot[], rows: EofyHistoricalCostRow[], endDate: string) {
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

export function unrealisedCgtReport(openLots: OpenTaxLot[]): EofyUnrealisedCgtReport {
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
