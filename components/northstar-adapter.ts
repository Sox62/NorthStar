import type { DashboardData, OwnerType, Scope } from "@/lib/storage";
import { sectorForInstrument } from "@/northstar/lib/sector-map";
import type { Holding } from "@/northstar/types";

export type AccountSummary = {
  scope: Exclude<Scope, "overall">;
  label: string;
  netAssetValue: number;
  investedValue: number;
  cashValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  positionCount: number;
  shareOfOverall: number;
  lastUpdated: string | null;
};

function ownerFromScope(scope: Scope): OwnerType {
  return scope === "smsf" ? "SMSF" : "PERSONAL";
}

function cashHolding(data: DashboardData): Holding | null {
  if (data.scope === "overall" || data.cashValue <= 0) return null;
  const ownerType = ownerFromScope(data.scope);
  const ownerLabel = ownerType === "SMSF" ? "SMSF" : "Personal";
  return {
    id: `cash-${data.scope}`,
    symbol: "CASH",
    name: `${ownerLabel} cash reserve`,
    ownerType,
    sector: "Cash",
    units: data.cashValue,
    costAud: 0,
    marketValueAud: data.cashValue,
    pnlAud: 0,
    pnlPercent: 0,
    valuationBasis: "market",
  };
}

export function dashboardToNorthstarHoldings(data: DashboardData): Holding[] {
  const holdings = data.holdings.map((position): Holding => ({
    id: position.id,
    symbol: position.symbol,
    name: position.name,
    ownerType: position.ownerType,
    sector: sectorForInstrument(position),
    units: position.quantity,
    costAud: position.costAud,
    marketValueAud: position.marketValueAud,
    pnlAud: position.pnlAud,
    pnlPercent: position.pnlPercent,
    valuationBasis: position.valuationBasis,
  }));

  const cash = cashHolding(data);
  if (cash) holdings.push(cash);
  return holdings;
}

export function dashboardToAccountSummary(data: DashboardData, overallValue: number): AccountSummary | null {
  if (data.scope === "overall") return null;
  return {
    scope: data.scope,
    label: data.scope === "smsf" ? "SMSF" : "Personal",
    netAssetValue: data.totalValue,
    investedValue: data.investedValue,
    cashValue: data.cashValue,
    totalReturn: data.totalReturn,
    totalReturnPercent: data.totalReturnPercent,
    positionCount: data.holdings.length,
    shareOfOverall: overallValue ? data.totalValue / overallValue * 100 : 0,
    lastUpdated: data.lastUpdated,
  };
}
