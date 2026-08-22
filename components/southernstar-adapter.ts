import type { DashboardData, Scope } from "@/lib/storage";
import { sectorForInstrument } from "@/southernstar/lib/sector-map";
import type { Holding } from "@/southernstar/types";

export type AccountSummary = {
  scope: Exclude<Scope, "overall">;
  label: string;
  netAssetValue: number;
  investedValue: number;
  cashValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  positionCount: number;
  sharePositionValue: number;
  brokerShareTotals: Array<{ broker: string; value: number; positionCount: number }>;
  shareOfOverall: number;
  lastUpdated: string | null;
};

export function dashboardToSouthernStarHoldings(data: DashboardData): Holding[] {
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

function brokerDisplayName(broker: string) {
  const normalized = broker.trim();
  if (normalized.toLowerCase() === "ibkr") return "IBKR";
  if (normalized.toLowerCase() === "directshares") return "Directshares";
  return normalized || "Unknown";
}

function isSharePosition(position: DashboardData["holdings"][number]) {
  return position.symbol !== "CASH" && position.assetClass !== "Cash" && position.broker !== "Physical";
}

function brokerShareTotals(data: DashboardData) {
  const totals = new Map<string, { broker: string; value: number; positionCount: number }>();
  for (const position of data.holdings) {
    if (!isSharePosition(position)) continue;
    const broker = brokerDisplayName(position.broker);
    const current = totals.get(broker) ?? { broker, value: 0, positionCount: 0 };
    current.value += position.marketValueAud;
    current.positionCount += 1;
    totals.set(broker, current);
  }
  return [...totals.values()].sort((a, b) => b.value - a.value || a.broker.localeCompare(b.broker));
}

export function dashboardToAccountSummary(data: DashboardData, overallValue: number): AccountSummary | null {
  if (data.scope === "overall") return null;
  const shareTotals = brokerShareTotals(data);
  return {
    scope: data.scope,
    label: data.scope === "smsf" ? "SMSF" : "Personal",
    netAssetValue: data.totalValue,
    investedValue: data.investedValue,
    cashValue: data.cashValue,
    totalReturn: data.totalReturn,
    totalReturnPercent: data.totalReturnPercent,
    positionCount: data.holdings.filter(isSharePosition).length,
    sharePositionValue: shareTotals.reduce((sum, item) => sum + item.value, 0),
    brokerShareTotals: shareTotals,
    shareOfOverall: overallValue ? data.totalValue / overallValue * 100 : 0,
    lastUpdated: data.lastUpdated,
  };
}
