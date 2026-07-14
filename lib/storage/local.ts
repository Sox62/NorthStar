import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { IbkrFlexReport, ImportedTransaction, OpeningPosition } from "@/lib/integrations/types";
import { classifyAsset } from "./classify";
import type {
  CashAccount,
  DashboardData,
  ImportResult,
  LocalStore,
  ManualAsset,
  OwnerType,
  Scope,
  Snapshot,
  StorageAdapter,
  StoredPosition,
  StoredTransaction,
} from "./types";

const DATA_FILE = process.env.NORTH_STAR_DATA_FILE || path.join(process.cwd(), ".north-star", "data.json");
const EMPTY: LocalStore = { version: 3, transactions: [], positions: [], cashAccounts: [], manualAssets: [], snapshots: [], imports: [] };

async function readStore(): Promise<LocalStore> {
  try {
    const parsed = JSON.parse(await readFile(DATA_FILE, "utf8")) as LocalStore | (Omit<LocalStore, "version" | "manualAssets"> & { version: 2 });
    if (parsed.version === 3) return parsed;
    if (parsed.version === 2) return { ...parsed, version: 3, manualAssets: [] };
    return structuredClone(EMPTY);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
    throw error;
  }
}

async function writeStore(store: LocalStore) {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  const temporary = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(store, null, 2), "utf8");
  await rename(temporary, DATA_FILE);
}

const maskAccount = (account: string) => account.length <= 4 ? account : `${account.slice(0, 2)}••••${account.slice(-3)}`;
const ownerForScope = (scope: Scope): OwnerType | undefined => scope === "personal" ? "PERSONAL" : scope === "smsf" ? "SMSF" : undefined;

function recalculateIbkrPositions(store: LocalStore, ownerType: OwnerType, accountKey: string) {
  const relevant = store.transactions.filter(transaction =>
    transaction.ownerType === ownerType && transaction.broker === "IBKR" && transaction.accountKey === accountKey && transaction.type !== "FX"
  );

  const grouped = new Map<string, StoredTransaction[]>();
  for (const transaction of relevant) {
    const key = transaction.instrumentKey || `${transaction.symbol}:${transaction.exchange}`;
    grouped.set(key, [...(grouped.get(key) ?? []), transaction]);
  }

  store.positions = store.positions.filter(position => !(position.ownerType === ownerType && position.broker === "IBKR" && position.accountKey === accountKey));

  for (const [instrumentKey, transactions] of grouped) {
    const quantity = transactions.reduce((sum, transaction) => sum + (transaction.quantity ?? 0), 0);
    if (Math.abs(quantity) < 0.00000001) continue;
    const ordered = [...transactions].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    const latest = ordered.at(-1)!;
    const costAud = transactions.reduce((sum, transaction) => sum + (transaction.cost ?? 0) * (transaction.fxRateToBase ?? 1), 0);
    const safeCost = Math.max(0, costAud);

    store.positions.push({
      id: randomUUID(), ownerType, broker: "IBKR", accountKey, instrumentKey,
      symbol: latest.symbol, name: latest.description || latest.symbol, exchange: latest.exchange,
      currency: latest.currency, assetClass: classifyAsset(latest.symbol, latest.description || ""),
      quantity, lastPrice: latest.closePrice ?? latest.price ?? null,
      averageCostAud: quantity ? safeCost / quantity : 0, costAud: safeCost, marketValueAud: safeCost,
      dayGainAud: 0, pnlAud: 0, pnlPercent: 0, valuationBasis: "cost_basis",
      asOfDate: latest.tradeDate, source: "IBKR Flex",
    });
  }
}

function replaceIbkrOpenPositions(store: LocalStore, report: IbkrFlexReport, ownerType: OwnerType, accountKey: string) {
  store.positions = store.positions.filter(position => !(position.ownerType === ownerType && position.broker === "IBKR" && position.accountKey === accountKey));
  for (const position of report.openPositions) {
    store.positions.push({
      id: randomUUID(), ownerType, broker: "IBKR", accountKey,
      instrumentKey: position.instrumentKey, symbol: position.symbol, name: position.description,
      exchange: position.exchange, currency: position.currency,
      assetClass: classifyAsset(position.symbol, position.description), quantity: position.quantity,
      lastPrice: position.lastPrice, averageCostAud: position.averageCostAud,
      costAud: position.costAud, marketValueAud: position.marketValueAud,
      dayGainAud: 0, pnlAud: position.pnlAud, pnlPercent: position.pnlPercent,
      valuationBasis: "market", asOfDate: position.asOfDate, source: "IBKR Open Positions",
    });
  }
}

function upsertIbkrCash(store: LocalStore, report: IbkrFlexReport, ownerType: OwnerType) {
  if (!report.cash) return;
  const existing = store.cashAccounts.find(account => account.ownerType === ownerType && account.institution === "IBKR" && account.name === "IBKR Cash");
  const account: CashAccount = {
    id: existing?.id ?? randomUUID(), ownerType, institution: "IBKR", name: "IBKR Cash",
    currency: "AUD", balance: report.cash.balance, balanceAud: report.cash.balanceAud,
    fxRateToAud: 1, asOfDate: report.cash.asOfDate, updatedAt: new Date().toISOString(),
  };
  if (existing) Object.assign(existing, account); else store.cashAccounts.push(account);
}

function manualAssetPosition(asset: ManualAsset): StoredPosition {
  return {
    id: asset.id, ownerType: asset.ownerType, broker: "Physical", accountKey: `${asset.ownerType}-PHYSICAL`,
    instrumentKey: `manual:${asset.id}`, symbol: "PLATINUM", name: asset.name, exchange: "PHYSICAL",
    currency: "AUD", assetClass: "Physical platinum", quantity: asset.quantityTroyOz,
    lastPrice: asset.currentPriceAudPerOz,
    averageCostAud: asset.quantityTroyOz ? asset.totalCostAud / asset.quantityTroyOz : 0,
    costAud: asset.totalCostAud, marketValueAud: asset.marketValueAud,
    dayGainAud: 0, pnlAud: asset.pnlAud, pnlPercent: asset.pnlPercent,
    valuationBasis: "market", asOfDate: asset.asOfDate, source: "Manual physical",
  };
}

function captureSnapshot(store: LocalStore, ownerType: OwnerType) {
  const positions = store.positions.filter(position => position.ownerType === ownerType);
  const manualAssets = store.manualAssets.filter(asset => asset.ownerType === ownerType);
  const cash = store.cashAccounts.filter(account => account.ownerType === ownerType);
  const snapshot: Snapshot = {
    id: randomUUID(), ownerType, capturedAt: new Date().toISOString(),
    marketValue: positions.reduce((sum, position) => sum + position.marketValueAud, 0) + manualAssets.reduce((sum, asset) => sum + asset.marketValueAud, 0),
    cashValue: cash.reduce((sum, account) => sum + account.balanceAud, 0), netContributions: 0,
  };
  store.snapshots.push(snapshot);
  if (store.snapshots.length > 2000) store.snapshots = store.snapshots.slice(-2000);
}

function dashboardFromStore(store: LocalStore, scope: Scope): DashboardData {
  const ownerType = ownerForScope(scope);
  const importedPositions = store.positions.filter(position => !ownerType || position.ownerType === ownerType);
  const manualAssets = store.manualAssets.filter(asset => !ownerType || asset.ownerType === ownerType);
  const positions = [...importedPositions, ...manualAssets.map(manualAssetPosition)];
  const cashAccounts = store.cashAccounts.filter(account => !ownerType || account.ownerType === ownerType);
  const transactions = store.transactions.filter(transaction => !ownerType || transaction.ownerType === ownerType);
  const imports = store.imports.filter(record => !ownerType || record.ownerType === ownerType);

  const investedValue = positions.reduce((sum, position) => sum + position.marketValueAud, 0);
  const cashValue = cashAccounts.reduce((sum, account) => sum + account.balanceAud, 0);
  const totalValue = investedValue + cashValue;
  const dailyMovement = positions.reduce((sum, position) => sum + position.dayGainAud, 0);
  const unrealised = positions.reduce((sum, position) => sum + position.pnlAud, 0);
  const realised = transactions.filter(transaction => transaction.type === "SELL")
    .reduce((sum, transaction) => sum + (transaction.realisedPnl ?? 0) * (transaction.fxRateToBase ?? 1), 0);
  const totalReturn = unrealised + realised;
  const totalCost = positions.reduce((sum, position) => sum + position.costAud, 0);
  const provisionalValue = positions.filter(position => position.valuationBasis === "cost_basis").reduce((sum, position) => sum + position.marketValueAud, 0);
  const currentValue = positions.filter(position => position.valuationBasis === "market").reduce((sum, position) => sum + position.marketValueAud, 0) + cashValue;

  const holdings = [...positions].sort((a, b) => b.marketValueAud - a.marketValueAud)
    .map(position => ({ ...position, weight: totalValue ? position.marketValueAud / totalValue * 100 : 0 }));

  const allocationAmounts = new Map<string, number>();
  for (const position of positions) allocationAmounts.set(position.assetClass, (allocationAmounts.get(position.assetClass) ?? 0) + position.marketValueAud);
  if (cashValue) allocationAmounts.set("Cash", cashValue);
  const allocations = [...allocationAmounts.entries()].map(([name, amount]) => ({ name, amount, value: totalValue ? amount / totalValue * 100 : 0 })).sort((a, b) => b.amount - a.amount);

  const daily = new Map<string, { PERSONAL?: Snapshot; SMSF?: Snapshot }>();
  for (const snapshot of store.snapshots) {
    if (ownerType && snapshot.ownerType !== ownerType) continue;
    const day = snapshot.capturedAt.slice(0, 10);
    const entry = daily.get(day) ?? {};
    const existing = entry[snapshot.ownerType];
    if (!existing || existing.capturedAt < snapshot.capturedAt) entry[snapshot.ownerType] = snapshot;
    daily.set(day, entry);
  }
  const performance = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-90).map(([date, item]) => {
    const personal = item.PERSONAL ? item.PERSONAL.marketValue + item.PERSONAL.cashValue : undefined;
    const smsf = item.SMSF ? item.SMSF.marketValue + item.SMSF.cashValue : undefined;
    return { date: new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00Z`)), overall: personal !== undefined || smsf !== undefined ? (personal ?? 0) + (smsf ?? 0) : undefined, personal, smsf };
  });

  const accountRows = imports.map(record => ({ name: `${record.source} ${record.ownerType === "SMSF" ? "SMSF" : "Personal"}`, detail: maskAccount(record.accountKey), status: `${record.recordCount} records`, ownerType: record.ownerType }));
  for (const account of cashAccounts) accountRows.push({ name: `${account.institution} · ${account.name}`, detail: `${account.currency} ${account.balance.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`, status: "Cash current", ownerType: account.ownerType });
  for (const owner of ["PERSONAL", "SMSF"] as const) {
    const assets = manualAssets.filter(asset => asset.ownerType === owner);
    if (assets.length) accountRows.push({ name: `Physical platinum ${owner === "SMSF" ? "SMSF" : "Personal"}`, detail: `${assets.reduce((sum, asset) => sum + asset.quantityTroyOz, 0).toLocaleString("en-AU", { maximumFractionDigits: 4 })} troy oz`, status: `${assets.length} position${assets.length === 1 ? "" : "s"}`, ownerType: owner });
  }

  const updatedValues = [...imports.map(record => record.importedAt), ...cashAccounts.map(account => account.updatedAt), ...manualAssets.map(asset => asset.updatedAt)].sort();
  return { scope, storageMode: "local-file", totalValue, investedValue, cashValue, dailyMovement, totalReturn, totalReturnPercent: totalCost ? totalReturn / totalCost * 100 : 0, holdings, allocations, performance, accounts: accountRows, provisionalValue, currentValue, lastUpdated: updatedValues.at(-1) ?? null };
}

export class LocalStorageAdapter implements StorageAdapter {
  async importIbkr(report: IbkrFlexReport, ownerType: OwnerType): Promise<ImportResult> {
    const store = await readStore();
    const accountKey = report.accountId || report.transactions.find(transaction => transaction.externalAccountId)?.externalAccountId || "IBKR";
    const existing = new Set(store.transactions.map(transaction => `${transaction.ownerType}:${transaction.broker}:${transaction.accountKey}:${transaction.externalId}`));
    let imported = 0;
    let duplicates = 0;

    for (const transaction of report.transactions) {
      const key = `${ownerType}:IBKR:${accountKey}:${transaction.externalId}`;
      if (existing.has(key)) { duplicates += 1; continue; }
      existing.add(key);
      const { raw: _raw, ...persisted } = transaction;
      store.transactions.push({ ...persisted, id: randomUUID(), ownerType, broker: "IBKR", accountKey });
      imported += 1;
    }

    if (report.openPositions.length) replaceIbkrOpenPositions(store, report, ownerType, accountKey);
    else recalculateIbkrPositions(store, ownerType, accountKey);
    upsertIbkrCash(store, report, ownerType);

    const importRecord = store.imports.find(record => record.source === "IBKR" && record.ownerType === ownerType && record.accountKey === accountKey);
    const recordCount = store.transactions.filter(transaction => transaction.ownerType === ownerType && transaction.broker === "IBKR" && transaction.accountKey === accountKey).length;
    if (importRecord) { importRecord.importedAt = new Date().toISOString(); importRecord.recordCount = recordCount; }
    else store.imports.push({ id: randomUUID(), source: "IBKR", ownerType, importedAt: new Date().toISOString(), recordCount, accountKey });

    captureSnapshot(store, ownerType);
    await writeStore(store);
    const positionCount = store.positions.filter(position => position.ownerType === ownerType && position.broker === "IBKR" && position.accountKey === accountKey).length;
    return { source: "IBKR", ownerType, accountKey: maskAccount(accountKey), imported, duplicates, positions: positionCount, openPositions: report.openPositions.length, cashAud: report.cash?.balanceAud, valuationSource: report.openPositions.length ? "open_positions" : "trade_cost_basis", storageMode: "local-file" };
  }

  async importDirectshares(positions: OpeningPosition[], ownerType: OwnerType): Promise<ImportResult> {
    const store = await readStore();
    const accountKey = positions.find(position => position.externalAccountId)?.externalAccountId || "DIRECTSHARES";
    store.positions = store.positions.filter(position => !(position.ownerType === ownerType && position.broker === "Directshares" && position.accountKey === accountKey));
    const asOfDate = new Date().toISOString().slice(0, 10);
    for (const position of positions) store.positions.push({
      id: randomUUID(), ownerType, broker: "Directshares", accountKey,
      instrumentKey: `Directshares:${position.symbol}:${position.exchange}`, symbol: position.symbol, name: position.symbol,
      exchange: position.exchange, currency: position.currency, assetClass: classifyAsset(position.symbol, position.symbol),
      quantity: position.quantity, lastPrice: position.lastPrice, averageCostAud: position.averageCostAud,
      costAud: position.costAud, marketValueAud: position.marketValueAud, dayGainAud: position.dayGainAud,
      pnlAud: position.pnlAud, pnlPercent: position.pnlPercent, valuationBasis: "market", asOfDate, source: "Directshares CSV",
    });

    const importRecord = store.imports.find(record => record.source === "Directshares" && record.ownerType === ownerType && record.accountKey === accountKey);
    if (importRecord) { importRecord.importedAt = new Date().toISOString(); importRecord.recordCount = positions.length; }
    else store.imports.push({ id: randomUUID(), source: "Directshares", ownerType, importedAt: new Date().toISOString(), recordCount: positions.length, accountKey });
    captureSnapshot(store, ownerType);
    await writeStore(store);
    return { source: "Directshares", ownerType, accountKey: maskAccount(accountKey), imported: positions.length, duplicates: 0, positions: positions.length, storageMode: "local-file" };
  }

  async listCashAccounts(ownerType?: OwnerType) {
    const store = await readStore();
    return store.cashAccounts.filter(account => !ownerType || account.ownerType === ownerType).sort((a, b) => a.institution.localeCompare(b.institution));
  }

  async upsertCashAccount(input: Omit<CashAccount, "id" | "updatedAt" | "balanceAud"> & { id?: string }) {
    const store = await readStore();
    const existing = input.id ? store.cashAccounts.find(account => account.id === input.id) : store.cashAccounts.find(account => account.ownerType === input.ownerType && account.institution === input.institution && account.name === input.name);
    const account: CashAccount = { id: existing?.id ?? randomUUID(), ownerType: input.ownerType, institution: input.institution.trim(), name: input.name.trim(), currency: input.currency.toUpperCase(), balance: input.balance, fxRateToAud: input.fxRateToAud, balanceAud: input.balance * input.fxRateToAud, asOfDate: input.asOfDate, updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, account); else store.cashAccounts.push(account);
    captureSnapshot(store, input.ownerType);
    await writeStore(store);
    return account;
  }

  async listManualAssets(ownerType?: OwnerType) {
    const store = await readStore();
    return store.manualAssets.filter(asset => !ownerType || asset.ownerType === ownerType).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }

  async upsertManualAsset(input: Omit<ManualAsset, "id" | "updatedAt" | "marketValueAud" | "pnlAud" | "pnlPercent"> & { id?: string }) {
    const store = await readStore();
    const existing = input.id ? store.manualAssets.find(asset => asset.id === input.id && asset.ownerType === input.ownerType) : undefined;
    const marketValueAud = input.quantityTroyOz * input.currentPriceAudPerOz;
    const pnlAud = marketValueAud - input.totalCostAud;
    const asset: ManualAsset = {
      id: existing?.id ?? randomUUID(), ownerType: input.ownerType, assetType: "PLATINUM", name: input.name.trim(),
      quantityTroyOz: input.quantityTroyOz, totalCostAud: input.totalCostAud,
      currentPriceAudPerOz: input.currentPriceAudPerOz, marketValueAud, pnlAud,
      pnlPercent: input.totalCostAud ? pnlAud / input.totalCostAud * 100 : 0,
      purchaseDate: input.purchaseDate, asOfDate: input.asOfDate, updatedAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, asset); else store.manualAssets.push(asset);
    captureSnapshot(store, input.ownerType);
    await writeStore(store);
    return asset;
  }

  async deleteManualAsset(id: string, ownerType: OwnerType) {
    const store = await readStore();
    store.manualAssets = store.manualAssets.filter(asset => !(asset.id === id && asset.ownerType === ownerType));
    captureSnapshot(store, ownerType);
    await writeStore(store);
  }

  async dashboard(scope: Scope) { return dashboardFromStore(await readStore(), scope); }
}
