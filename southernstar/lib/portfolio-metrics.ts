// Pure helpers to derive dashboard figures from a live holdings array.
// Holdings change on every sync — always compute, never store these.

import type { Holding, OwnerType, PortfolioScope, Sector, CompositionGroup } from "../types";
import { COMPOSITION_OF } from "../types";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
export const fmtAud = (v: number) => money.format(v);

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

/** Metals vs miners vs other composition, by market value. */
export function byComposition(holdings: Holding[]): Record<CompositionGroup, number> {
  const out: Record<CompositionGroup, number> = { miners: 0, metals: 0, other: 0 };
  for (const h of holdings) out[COMPOSITION_OF[h.sector]] += h.marketValueAud;
  return out;
}
