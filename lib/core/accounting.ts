import { normaliseAllocationTargets } from "@/northstar/lib/allocation-drift";
import { buildCurrencyExposure } from "@/lib/storage/exposure";
import { buildValuationFreshness } from "@/lib/storage/freshness";
import { buildIncomeSummary } from "@/lib/storage/income";
import { buildPeriodReturns, type NavPoint } from "@/lib/storage/returns";
import { buildXirrSummary } from "@/lib/storage/xirr";
import type {
  AllocationTarget,
  CashAccount,
  DashboardData,
  ManualAsset,
  OwnerType,
  Scope,
  StoredPosition,
  StoredTransaction,
  SyncRun,
} from "@/lib/storage/types";

export type DashboardImportSummary = {
  source: string;
  ownerType: OwnerType;
  importedAt: string;
  recordCount: number;
  accountKey: string;
};

export type DashboardSnapshotValue = {
  ownerType: OwnerType;
  capturedAt: string;
  marketValue: number;
  cashValue: number;
};

export type ManualAssetValuation = {
  costAudPerKg: number;
  marketValueAud: number;
  pnlAud: number;
  pnlPercent: number;
  dealerSpreadAudPerKg: number;
  dealerSpreadPercent: number;
};

export type PositionPriceValuation = {
  marketValueAud: number;
  dayGainAud: number;
  pnlAud: number;
  pnlPercent: number;
};

export function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function percent(numerator: number, denominator: number) {
  return denominator ? (numerator / denominator) * 100 : 0;
}

export function maskAccount(account: string) {
  return account.length <= 4 ? account : `${account.slice(0, 2)}••••${account.slice(-3)}`;
}

export function ownerForScope(scope: Scope): OwnerType | undefined {
  if (scope === "personal") return "PERSONAL";
  if (scope === "smsf") return "SMSF";
  return undefined;
}

export function buildManualAssetValuation(input: {
  quantityKg: number;
  totalCostAud: number;
  buybackAudPerKg: number;
  retailAudPerKg: number;
}): ManualAssetValuation {
  const marketValueAud = input.quantityKg * input.buybackAudPerKg;
  const pnlAud = marketValueAud - input.totalCostAud;
  const dealerSpreadAudPerKg = Math.max(0, input.retailAudPerKg - input.buybackAudPerKg);
  return {
    costAudPerKg: input.quantityKg ? input.totalCostAud / input.quantityKg : 0,
    marketValueAud,
    pnlAud,
    pnlPercent: percent(pnlAud, input.totalCostAud),
    dealerSpreadAudPerKg,
    dealerSpreadPercent: percent(dealerSpreadAudPerKg, input.retailAudPerKg),
  };
}

export function buildPositionPriceValuation(input: {
  quantity: number;
  close: number;
  fxRateToAud: number;
  costAud: number;
  previousClose?: number | null;
  previousMarketValueAud?: number;
}): PositionPriceValuation {
  const marketValueAud = input.quantity * input.close * input.fxRateToAud;
  const dayGainAud = input.previousClose == null
    ? marketValueAud - (input.previousMarketValueAud ?? 0)
    : input.quantity * (input.close - input.previousClose) * input.fxRateToAud;
  const pnlAud = marketValueAud - input.costAud;
  return {
    marketValueAud,
    dayGainAud,
    pnlAud,
    pnlPercent: percent(pnlAud, input.costAud),
  };
}

export function manualAssetPosition(asset: ManualAsset): StoredPosition {
  return {
    id: asset.id,
    ownerType: asset.ownerType,
    broker: "Physical",
    accountKey: `${asset.ownerType}-PHYSICAL`,
    instrumentKey: `manual:${asset.id}`,
    symbol: "PLATINUM",
    name: asset.name,
    exchange: "PHYSICAL",
    currency: "AUD",
    assetClass: "Physical platinum",
    quantity: asset.quantityKg,
    lastPrice: asset.buybackAudPerKg,
    averageCostAud: asset.costAudPerKg,
    costAud: asset.totalCostAud,
    marketValueAud: asset.marketValueAud,
    dayGainAud: 0,
    pnlAud: asset.pnlAud,
    pnlPercent: asset.pnlPercent,
    valuationBasis: "market",
    asOfDate: asset.asOfDate,
    source: "Manual physical",
  };
}

function buildSnapshotSeries(snapshots: DashboardSnapshotValue[]) {
  const daily = new Map<string, { PERSONAL?: DashboardSnapshotValue; SMSF?: DashboardSnapshotValue }>();
  for (const snapshot of snapshots) {
    const day = snapshot.capturedAt.slice(0, 10);
    const entry = daily.get(day) ?? {};
    const current = entry[snapshot.ownerType];
    if (!current || current.capturedAt < snapshot.capturedAt) entry[snapshot.ownerType] = snapshot;
    daily.set(day, entry);
  }

  return [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, item]) => {
    const personal = item.PERSONAL ? item.PERSONAL.marketValue + item.PERSONAL.cashValue : undefined;
    const smsf = item.SMSF ? item.SMSF.marketValue + item.SMSF.cashValue : undefined;
    return {
      date,
      overall: personal !== undefined || smsf !== undefined ? (personal ?? 0) + (smsf ?? 0) : undefined,
      personal,
      smsf,
    };
  });
}

function navSeriesForScope(performance: DashboardData["performance"], ownerType: OwnerType | undefined): NavPoint[] {
  return performance.map((point) => {
    const value = ownerType === "PERSONAL"
      ? point.personal
      : ownerType === "SMSF"
        ? point.smsf
        : point.overall;
    return { date: point.date, value: value ?? 0 };
  });
}

function buildAccountRows(input: {
  imports: DashboardImportSummary[];
  cashAccounts: CashAccount[];
  manualAssets: ManualAsset[];
}) {
  const accounts = input.imports.map((record) => ({
    name: `${record.source} ${record.ownerType === "SMSF" ? "SMSF" : "Personal"}`,
    detail: maskAccount(record.accountKey),
    status: `${record.recordCount} records`,
    ownerType: record.ownerType,
  }));

  for (const account of input.cashAccounts) {
    accounts.push({
      name: `${account.institution} · ${account.name}`,
      detail: `${account.currency} ${account.balance.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`,
      status: "Cash current",
      ownerType: account.ownerType,
    });
  }

  for (const owner of ["PERSONAL", "SMSF"] as const) {
    const assets = input.manualAssets.filter((asset) => asset.ownerType === owner);
    if (!assets.length) continue;
    accounts.push({
      name: `Physical platinum ${owner === "SMSF" ? "SMSF" : "Personal"}`,
      detail: `${assets.reduce((sum, asset) => sum + asset.quantityKg, 0).toLocaleString("en-AU", { maximumFractionDigits: 4 })} kg`,
      status: `${assets.length} position${assets.length === 1 ? "" : "s"}`,
      ownerType: owner,
    });
  }

  return accounts;
}

export function buildDashboardModel(input: {
  scope: Scope;
  storageMode: DashboardData["storageMode"];
  positions: StoredPosition[];
  manualAssets: ManualAsset[];
  cashAccounts: CashAccount[];
  transactions: StoredTransaction[];
  imports: DashboardImportSummary[];
  snapshots: DashboardSnapshotValue[];
  syncRuns: SyncRun[];
  allocationTargets: AllocationTarget[];
}): DashboardData {
  const ownerType = ownerForScope(input.scope);
  const importedPositions = input.positions.filter((position) => !ownerType || position.ownerType === ownerType);
  const manualAssets = input.manualAssets.filter((asset) => !ownerType || asset.ownerType === ownerType);
  const cashAccounts = input.cashAccounts.filter((account) => !ownerType || account.ownerType === ownerType);
  const transactions = input.transactions.filter((transaction) => !ownerType || transaction.ownerType === ownerType);
  const imports = input.imports.filter((record) => !ownerType || record.ownerType === ownerType);
  const snapshots = input.snapshots.filter((snapshot) => !ownerType || snapshot.ownerType === ownerType);
  const manualPositions = manualAssets.map(manualAssetPosition);
  const positions = [...importedPositions, ...manualPositions];
  const investedValue = positions.reduce((sum, position) => sum + position.marketValueAud, 0);
  const cashValue = cashAccounts.reduce((sum, account) => sum + account.balanceAud, 0);
  const totalValue = investedValue + cashValue;
  const dailyMovement = positions.reduce((sum, position) => sum + position.dayGainAud, 0);
  const unrealised = positions.reduce((sum, position) => sum + position.pnlAud, 0);
  const realised = transactions
    .filter((transaction) => transaction.type === "SELL")
    .reduce((sum, transaction) => sum + (transaction.realisedPnl ?? 0) * (transaction.fxRateToBase ?? 1), 0);
  const totalReturn = unrealised + realised;
  const totalCost = positions.reduce((sum, position) => sum + position.costAud, 0);
  const provisionalValue = positions
    .filter((position) => position.valuationBasis === "cost_basis")
    .reduce((sum, position) => sum + position.marketValueAud, 0);
  const currentValue = positions
    .filter((position) => position.valuationBasis === "market")
    .reduce((sum, position) => sum + position.marketValueAud, 0) + cashValue;

  const holdings = [...positions]
    .sort((a, b) => b.marketValueAud - a.marketValueAud)
    .map((position) => ({ ...position, weight: percent(position.marketValueAud, totalValue) }));

  const allocationAmounts = new Map<string, number>();
  for (const position of positions) {
    allocationAmounts.set(position.assetClass, (allocationAmounts.get(position.assetClass) ?? 0) + position.marketValueAud);
  }
  if (cashValue) allocationAmounts.set("Cash", cashValue);
  const allocations = [...allocationAmounts.entries()]
    .map(([name, amount]) => ({ name, amount, value: percent(amount, totalValue) }))
    .sort((a, b) => b.amount - a.amount);

  const performance = buildSnapshotSeries(snapshots);
  const updatedValues = [
    ...imports.map((record) => record.importedAt),
    ...cashAccounts.map((account) => account.updatedAt),
    ...manualAssets.map((asset) => asset.updatedAt),
  ].sort();
  const lastUpdated = updatedValues.at(-1) ?? null;
  const syncRuns = [...input.syncRuns]
    .filter((run) => !ownerType || !run.ownerType || run.ownerType === ownerType)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .slice(0, 8);

  return {
    scope: input.scope,
    storageMode: input.storageMode,
    totalValue,
    investedValue,
    cashValue,
    dailyMovement,
    totalReturn,
    totalReturnPercent: percent(totalReturn, totalCost),
    holdings,
    allocations,
    performance,
    periodReturns: buildPeriodReturns(navSeriesForScope(performance, ownerType)),
    xirr: buildXirrSummary({
      scope: input.scope,
      positions,
      cashAccounts,
      transactions,
      asOfDate: lastUpdated,
    }),
    income: buildIncomeSummary(transactions, totalValue),
    allocationTargets: normaliseAllocationTargets(input.allocationTargets),
    currencyExposure: buildCurrencyExposure(positions, cashAccounts, totalValue),
    accounts: buildAccountRows({ imports, cashAccounts, manualAssets }),
    syncRuns,
    freshness: buildValuationFreshness({ positions, cashAccounts, manualAssets, syncRuns }),
    provisionalValue,
    currentValue,
    lastUpdated,
  };
}
