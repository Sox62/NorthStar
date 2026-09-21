// Pure helpers to derive dashboard figures from a live holdings array.
// Holdings change on every sync — always compute, never store these.

import { canonicalInstrumentName } from "@/lib/storage/instrument-names";
import type { Holding, OwnerType, PortfolioScope, Sector, CompositionGroup } from "../types";
import { COMPOSITION_OF } from "../types";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
export const fmtAud = (v: number) => money.format(v);

export interface HoldingTickerRollup {
  id: string;
  symbol: string;
  name: string;
  sector: Sector;
  ownerLabel: string;
  positionCount: number;
  units: number;
  costAud: number;
  marketValueAud: number;
  dayGainAud: number;
  pnlAud: number;
  pnlPercent: number;
  chartHolding: Holding;
}

/** Filter to a scope. "overall" = both books; otherwise the matching owner. */
export function byScope(holdings: Holding[], scope: PortfolioScope): Holding[] {
  if (scope === "overall") return holdings;
  const owner: OwnerType = scope === "smsf" ? "SMSF" : "PERSONAL";
  return holdings.filter((h) => h.ownerType === owner);
}

export interface Totals {
  marketValue: number;
  cost: number;
  pnl: number;
  pnlPercent: number;
  count: number;
}

export function totals(holdings: Holding[]): Totals {
  const t = holdings.reduce(
    (a, h) => ({ mv: a.mv + h.marketValueAud, cost: a.cost + h.costAud, pnl: a.pnl + h.pnlAud }),
    { mv: 0, cost: 0, pnl: 0 }
  );
  return {
    marketValue: t.mv,
    cost: t.cost,
    pnl: t.pnl,
    pnlPercent: t.cost ? (t.pnl / t.cost) * 100 : 0,
    count: holdings.length,
  };
}

/** Owner split — the legal Personal vs SMSF separation, by market value. */
export function ownerSplit(holdings: Holding[]) {
  const personal = holdings.filter((h) => h.ownerType === "PERSONAL").reduce((s, h) => s + h.marketValueAud, 0);
  const smsf = holdings.filter((h) => h.ownerType === "SMSF").reduce((s, h) => s + h.marketValueAud, 0);
  return { personal, smsf, total: personal + smsf };
}

/** Aggregate market value by sector, largest first. */
export function bySector(holdings: Holding[]): Array<{ sector: Sector; value: number }> {
  const map = new Map<Sector, number>();
  for (const h of holdings) map.set(h.sector, (map.get(h.sector) ?? 0) + h.marketValueAud);
  return [...map.entries()].map(([sector, value]) => ({ sector, value })).sort((a, b) => b.value - a.value);
}

function ownerLabel(owners: Set<OwnerType>) {
  if (owners.has("PERSONAL") && owners.has("SMSF")) return "Personal + SMSF";
  if (owners.has("SMSF")) return "SMSF";
  return "Personal";
}

/** Roll broker/account-level holdings into one display row per sector ticker. */
export function rollupHoldingsByTicker(holdings: Holding[]): HoldingTickerRollup[] {
  const rows = new Map<string, HoldingTickerRollup & { owners: Set<OwnerType> }>();
  for (const holding of holdings) {
    const symbol = holding.symbol.trim().toUpperCase();
    const key = `${holding.sector}:${symbol}`;
    const current = rows.get(key);
    if (!current) {
      rows.set(key, {
        id: key,
        symbol,
        name: canonicalInstrumentName(symbol, holding.name),
        sector: holding.sector,
        ownerLabel: holding.ownerType === "SMSF" ? "SMSF" : "Personal",
        owners: new Set([holding.ownerType]),
        positionCount: 1,
        units: holding.units,
        costAud: holding.costAud,
        marketValueAud: holding.marketValueAud,
        dayGainAud: holding.dayGainAud ?? 0,
        pnlAud: holding.pnlAud,
        pnlPercent: holding.costAud ? holding.pnlAud / holding.costAud * 100 : 0,
        chartHolding: holding,
      });
      continue;
    }

    current.owners.add(holding.ownerType);
    current.positionCount += 1;
    current.units += holding.units;
    current.costAud += holding.costAud;
    current.marketValueAud += holding.marketValueAud;
    current.dayGainAud += holding.dayGainAud ?? 0;
    current.pnlAud += holding.pnlAud;
    current.pnlPercent = current.costAud ? current.pnlAud / current.costAud * 100 : 0;
    current.ownerLabel = ownerLabel(current.owners);
    if (holding.marketValueAud > current.chartHolding.marketValueAud) {
      current.name = canonicalInstrumentName(symbol, holding.name);
      current.chartHolding = holding;
    }
  }

  return [...rows.values()]
    .map(({ owners, ...row }) => row)
    .sort((a, b) => b.marketValueAud - a.marketValueAud || a.symbol.localeCompare(b.symbol));
}

/** Metals vs miners vs other composition, by market value. */
export function byComposition(holdings: Holding[]): Record<CompositionGroup, number> {
  const out: Record<CompositionGroup, number> = { miners: 0, metals: 0, other: 0 };
  for (const h of holdings) out[COMPOSITION_OF[h.sector]] += h.marketValueAud;
  return out;
}
