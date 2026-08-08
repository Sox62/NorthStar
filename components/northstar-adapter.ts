import type { CashAccount, DashboardData, OwnerType, Scope } from "@/lib/storage";
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

function cashHoldingFromAccount(account: CashAccount): Holding {
  const ownerLabel = account.ownerType === "SMSF" ? "SMSF" : "Personal";
  const accountLabel = `${ownerLabel} ${account.institution} ${account.name}`.replace(/\\s+/g, " ").trim();
  return {
    id: `cash-${account.id}`,
    symbol: "CASH",
    name: accountLabel,
    ownerType: account.ownerType,
    sector: "Cash",
    units: account.balanceAud,
    costAud: 0,
    marketValueAud: account.balanceAud,
    dayGainAud: 0,
    pnlAud: 0,
    pnlPercent: 0,
    valuationBasis: "market",
    lastPrice: account.fxRateToAud,
    priceCurrency: account.currency,
    priceAsOfDate: account.asOfDate,
    broker: account.institution,
    accountKey: `${account.ownerType}-${account.institution}-${account.name}`,
    accountLabel,
  };
}

function cashHoldings(data: DashboardData): Holding[] {
  if (data.scope === "overall" || data.cashValue <= 0) return [];
  if (data.cashAccounts?.length) return data.cashAccounts.map(cashHoldingFromAccount);

  const ownerType = ownerFromScope(data.scope);
  const ownerLabel = ownerType === "SMSF" ? "SMSF" : "Personal";
  return [{
    id: `cash-${data.scope}`,
    symbol: "CASH",
    name: `${ownerLabel} cash reserve`,
    ownerType,
    sector: "Cash",
    units: data.cashValue,
    costAud: 0,
    marketValueAud: data.cashValue,
    dayGainAud: 0,
    pnlAud: 0,
    pnlPercent: 0,
    valuationBasis: "market",
    broker: "Cash",
    accountKey: `${data.scope}-cash`,
    accountLabel: `${ownerLabel} cash`,
  }];
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

  holdings.push(...cashHoldings(data));
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
