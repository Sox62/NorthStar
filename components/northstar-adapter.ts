import type { DashboardData, Scope } from "@/lib/storage";
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
    dayGainAud: position.dayGainAud,
    pnlAud: position.pnlAud,
    pnlPercent: position.pnlPercent,
    valuationBasis: position.valuationBasis,
    lastPrice: position.lastPrice,
    priceCurrency: position.currency,
    priceAsOfDate: position.asOfDate,
    exchange: position.exchange,
    broker: position.broker,
    accountKey: position.accountKey,
    accountLabel: position.accountKey ? `${position.broker} ${position.accountKey}` : position.broker,
  }));

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
