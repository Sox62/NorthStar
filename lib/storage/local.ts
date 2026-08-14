import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { IbkrFlexReport, ImportedTransaction, OpeningPosition } from "@/lib/integrations/types";
import {
  buildDashboardModel,
  buildManualAssetValuation,
  buildPositionPriceValuation,
  manualAssetPosition,
  maskAccount,
  ownerForScope,
} from "@/lib/core/accounting";
import { defaultAllocationTargets, normaliseAllocationTargets } from "@/northstar/lib/allocation-drift";
import { classifyAsset } from "./classify";
import { resolveIbkrCurrentPositions } from "./ibkr-positions";
import type {
  CashAccount,
  AllocationTarget,
  DashboardData,
  ImportResult,
  LocalStore,
  ManualAsset,
  MinerFundamentals,
  MinerFundamentalsInput,
  StructuralLevel,
  StructuralLevelInput,
  NewSyncRun,
  OwnerType,
  DailyPriceInput,
  FxRateInput,
  PriceBook,
  PriceImportResult,
  PlatinumPrice,
  Scope,
  Snapshot,
  StoredDailyPrice,
  StoredFxRate,
  StorageAdapter,
  SyncRun,
  StoredPosition,
  StoredOpenOrder,
} from "./types";

const DATA_FILE = process.env.NORTH_STAR_DATA_FILE || path.join(process.cwd(), ".north-star", "data.json");
const EMPTY: LocalStore = { version: 6, transactions: [], positions: [], openOrders: [], cashAccounts: [], manualAssets: [], platinumPrices: [], dailyPrices: [], fxRates: [], snapshots: [], syncRuns: [], allocationTargets: defaultAllocationTargets(), minerFundamentals: [], structuralLevels: [], imports: [] };

function normalisePhysicalMetalType(value: unknown) {
  return value === "GOLD" || value === "SILVER" || value === "PLATINUM" || value === "PALLADIUM" ? value : "PLATINUM";
}

async function readStore(): Promise<LocalStore> {
  try {
    const parsed = JSON.parse(await readFile(DATA_FILE, "utf8")) as Record<string, unknown>;
    if (parsed.version === 6) {
      return {
        ...(parsed as unknown as LocalStore),
        platinumPrices: (parsed.platinumPrices as PlatinumPrice[] | undefined) ?? [],
        openOrders: (parsed.openOrders as StoredOpenOrder[] | undefined) ?? [],
        dailyPrices: (parsed.dailyPrices as StoredDailyPrice[] | undefined) ?? [],
        fxRates: (parsed.fxRates as StoredFxRate[] | undefined) ?? [],
        syncRuns: (parsed.syncRuns as SyncRun[] | undefined) ?? [],
        allocationTargets: normaliseAllocationTargets((parsed.allocationTargets as AllocationTarget[] | undefined) ?? []),
        minerFundamentals: (parsed.minerFundamentals as MinerFundamentals[] | undefined) ?? [],
        structuralLevels: (parsed.structuralLevels as StructuralLevel[] | undefined) ?? [],
      };
    }
    if (parsed.version === 5) {
      return {
        ...(parsed as unknown as Omit<LocalStore, "version" | "dailyPrices" | "fxRates">),
        version: 6,
        platinumPrices: (parsed.platinumPrices as PlatinumPrice[] | undefined) ?? [],
        openOrders: (parsed.openOrders as StoredOpenOrder[] | undefined) ?? [],
        dailyPrices: [],
        fxRates: [],
        syncRuns: (parsed.syncRuns as SyncRun[] | undefined) ?? [],
        allocationTargets: normaliseAllocationTargets((parsed.allocationTargets as AllocationTarget[] | undefined) ?? []),
        minerFundamentals: (parsed.minerFundamentals as MinerFundamentals[] | undefined) ?? [],
        structuralLevels: (parsed.structuralLevels as StructuralLevel[] | undefined) ?? [],
      };
    }
    if (parsed.version === 4) {
      return {
        ...(parsed as unknown as Omit<LocalStore, "version" | "syncRuns">),
        version: 6,
        platinumPrices: (parsed.platinumPrices as PlatinumPrice[] | undefined) ?? [],
        openOrders: [],
        dailyPrices: [],
        fxRates: [],
        syncRuns: [],
        allocationTargets: defaultAllocationTargets(),
        minerFundamentals: [],
        structuralLevels: [],
      };
    }
    if (parsed.version === 3) {
      const legacyAssets = (parsed.manualAssets as Array<Record<string, unknown>> | undefined) ?? [];
      const manualAssets: ManualAsset[] = legacyAssets.map(asset => {
        const quantityTroyOz = Number(asset.quantityTroyOz ?? 0);
        const quantityKg = quantityTroyOz / 32.1507465686;
        const totalCostAud = Number(asset.totalCostAud ?? 0);
        const buybackAudPerKg = Number(asset.currentPriceAudPerOz ?? 0) * 32.1507465686;
        const marketValueAud = quantityKg * buybackAudPerKg;
        const pnlAud = marketValueAud - totalCostAud;
        return {
          id: String(asset.id), ownerType: asset.ownerType as OwnerType, assetType: normalisePhysicalMetalType(asset.assetType), name: String(asset.name ?? "Physical platinum"),
          quantityKg, totalCostAud, costAudPerKg: quantityKg ? totalCostAud / quantityKg : 0,
          buybackAudPerKg, retailAudPerKg: buybackAudPerKg, marketValueAud, pnlAud,
          pnlPercent: totalCostAud ? pnlAud / totalCostAud * 100 : 0,
          dealerSpreadAudPerKg: 0, dealerSpreadPercent: 0, priceProvider: "Legacy manual price",
          priceSourceUrl: "", purchaseDate: String(asset.purchaseDate), asOfDate: String(asset.asOfDate),
          priceRetrievedAt: String(asset.updatedAt ?? new Date().toISOString()), updatedAt: String(asset.updatedAt ?? new Date().toISOString()),
        };
      });
      return { ...(parsed as unknown as Omit<LocalStore, "version" | "manualAssets" | "platinumPrices" | "dailyPrices" | "fxRates" | "syncRuns" | "allocationTargets">), version: 6, manualAssets, platinumPrices: [], openOrders: [], dailyPrices: [], fxRates: [], syncRuns: [], allocationTargets: defaultAllocationTargets(), minerFundamentals: [], structuralLevels: [] };
    }
    if (parsed.version === 2) {
      return { ...(parsed as unknown as Omit<LocalStore, "version" | "manualAssets" | "platinumPrices" | "dailyPrices" | "fxRates" | "syncRuns" | "allocationTargets">), version: 6, manualAssets: [], platinumPrices: [], openOrders: [], dailyPrices: [], fxRates: [], syncRuns: [], allocationTargets: defaultAllocationTargets(), minerFundamentals: [], structuralLevels: [] };
    }
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

function replaceIbkrOpenPositions(store: LocalStore, report: IbkrFlexReport, ownerType: OwnerType, accountKey: string) {
  store.positions = store.positions.filter(position => !(position.ownerType === ownerType && position.broker === "IBKR" && position.accountKey === accountKey));
  for (const position of resolveIbkrCurrentPositions(report)) {
    store.positions.push({
      id: randomUUID(), ownerType, broker: "IBKR", accountKey,
      instrumentKey: position.instrumentKey, symbol: position.symbol, name: position.description,
      exchange: position.exchange, currency: position.currency,
      assetClass: classifyAsset(position.symbol, position.description), quantity: position.quantity,
      lastPrice: position.lastPrice, averageCostAud: position.averageCostAud,
      costAud: position.costAud, marketValueAud: position.marketValueAud,
      dayGainAud: 0, pnlAud: position.pnlAud, pnlPercent: position.pnlPercent,
      valuationBasis: position.valuationBasis, asOfDate: position.asOfDate, source: position.source,
    });
  }
}


function replaceIbkrOpenOrders(store: LocalStore, report: IbkrFlexReport, ownerType: OwnerType, accountKey: string) {
  store.openOrders = store.openOrders.filter(order => !(order.ownerType === ownerType && order.broker === "IBKR" && order.accountKey === accountKey && order.source === "IBKR Flex"));
  const asOfDate = report.toDate || new Date().toISOString().slice(0, 10);
  for (const order of report.openOrders) {
    store.openOrders.push({
      id: randomUUID(), ownerType, broker: "IBKR", accountKey, orderId: order.orderId, conid: order.conid ?? "",
      symbol: order.symbol, name: order.description || order.symbol, exchange: order.exchange, currency: order.currency,
      side: order.side, status: order.status, orderType: order.orderType, timeInForce: order.timeInForce,
      totalQuantity: order.totalQuantity, filledQuantity: order.filledQuantity, remainingQuantity: order.remainingQuantity,
      limitPrice: order.limitPrice, stopPrice: order.stopPrice, averagePrice: order.averagePrice,
      description: order.description, createdAt: order.createdAt, updatedAt: order.updatedAt, asOfDate, source: "IBKR Flex", raw: order.raw,
    });
  }
}

function ibkrCashAccountName(report: IbkrFlexReport, cash: NonNullable<IbkrFlexReport["cash"]>, kind: "total" | "component") {
  const account = cash.externalAccountId || report.accountId;
  const accountPart = account && account !== "IBKR" ? ` · ${maskAccount(account)}` : "";
  return kind === "total" ? `IBKR Cash${accountPart} · Total AUD` : `IBKR Cash${accountPart} · ${cash.currency}`;
}

function writeIbkrCashAccount(store: LocalStore, ownerType: OwnerType, name: string, cash: NonNullable<IbkrFlexReport["cash"]>, isActive: boolean) {
  const existing = store.cashAccounts.find(account => account.ownerType === ownerType && account.institution === "IBKR" && account.name === name);
  const account: CashAccount = {
    id: existing?.id ?? randomUUID(), ownerType, institution: "IBKR", name,
    currency: cash.currency, balance: cash.balance, balanceAud: cash.balanceAud,
    fxRateToAud: cash.fxRateToAud, asOfDate: cash.asOfDate, updatedAt: new Date().toISOString(), isActive,
  };
  if (existing) Object.assign(existing, account); else store.cashAccounts.push(account);
}

function ibkrTotalCashFromComponents(report: IbkrFlexReport): IbkrFlexReport["cash"] {
  if (report.cash) return report.cash;
  if (!report.cashBalances.length) return null;
  return report.cashBalances.reduce<NonNullable<IbkrFlexReport["cash"]>>((sum, cash) => ({
    externalAccountId: cash.externalAccountId,
    currency: "AUD",
    balance: sum.balance + cash.balanceAud,
    balanceAud: sum.balanceAud + cash.balanceAud,
    settledBalance: sum.settledBalance + cash.settledBalanceAud,
    settledBalanceAud: sum.settledBalanceAud + cash.settledBalanceAud,
    fxRateToAud: 1,
    asOfDate: cash.asOfDate,
    raw: { derivedFrom: "cashBalances" },
  }), {
    externalAccountId: report.cashBalances[0]?.externalAccountId ?? report.accountId,
    currency: "AUD",
    balance: 0,
    balanceAud: 0,
    settledBalance: 0,
    settledBalanceAud: 0,
    fxRateToAud: 1,
    asOfDate: report.cashBalances[0]?.asOfDate ?? report.toDate,
  });
}

function upsertIbkrCash(store: LocalStore, report: IbkrFlexReport, ownerType: OwnerType) {
  const total = ibkrTotalCashFromComponents(report);
  const components = report.cashBalances;
  if (!total && !components.length) return;
  for (const existing of store.cashAccounts.filter(account => account.ownerType === ownerType && account.institution === "IBKR")) {
    existing.isActive = false;
    existing.updatedAt = new Date().toISOString();
  }
  if (total) writeIbkrCashAccount(store, ownerType, ibkrCashAccountName(report, total, "total"), total, true);
  else if (components.length === 1) writeIbkrCashAccount(store, ownerType, ibkrCashAccountName(report, components[0]!, "component"), components[0]!, true);
  for (const cash of components) writeIbkrCashAccount(store, ownerType, ibkrCashAccountName(report, cash, "component"), cash, false);
}


function replaceIbkrNavSnapshots(store: LocalStore, report: IbkrFlexReport, ownerType: OwnerType) {
  if (!report.navSnapshots.length) return;
  const days = new Set(report.navSnapshots.map((snapshot) => snapshot.date));
  store.snapshots = store.snapshots.filter((snapshot) => !(snapshot.ownerType === ownerType && days.has(snapshot.capturedAt.slice(0, 10))));
  for (const snapshot of report.navSnapshots) {
    store.snapshots.push({
      id: randomUUID(),
      ownerType,
      capturedAt: `${snapshot.date}T12:00:00.000Z`,
      marketValue: snapshot.stockValueAud,
      cashValue: snapshot.cashValueAud,
      netContributions: 0,
    });
  }
  if (store.snapshots.length > 5000) store.snapshots = store.snapshots.slice(-5000);
}

function captureSnapshot(store: LocalStore, ownerType: OwnerType) {
  const positions = store.positions.filter(position => position.ownerType === ownerType);
  const manualAssets = store.manualAssets.filter(asset => asset.ownerType === ownerType);
  const cash = store.cashAccounts.filter(account => account.ownerType === ownerType && account.isActive !== false);
  const snapshot: Snapshot = {
    id: randomUUID(), ownerType, capturedAt: new Date().toISOString(),
    marketValue: positions.reduce((sum, position) => sum + position.marketValueAud, 0) + manualAssets.reduce((sum, asset) => sum + asset.marketValueAud, 0),
    cashValue: cash.reduce((sum, account) => sum + account.balanceAud, 0), netContributions: 0,
  };
  store.snapshots.push(snapshot);
  if (store.snapshots.length > 2000) store.snapshots = store.snapshots.slice(-2000);
}

function buildSyncRun(input: NewSyncRun): SyncRun {
  const finishedAt = input.finishedAt ?? new Date().toISOString();
  const durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(input.startedAt).getTime());
  return {
    id: randomUUID(),
    source: input.source,
    ownerType: input.ownerType ?? null,
    trigger: input.trigger,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt,
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    recordCount: input.recordCount ?? null,
    positionCount: input.positionCount ?? null,
    cashAud: input.cashAud ?? null,
    message: input.message ?? null,
    error: input.error ?? null,
  };
}

function normaliseCurrency(value: string) {
  return value.trim().toUpperCase();
}

function normaliseSymbol(value: string) {
  return value.trim().toUpperCase();
}

function isPriceablePosition(position: StoredPosition) {
  const symbol = normaliseSymbol(position.symbol);
  const exchange = position.exchange.trim().toUpperCase();
  if (exchange === "IDEALFX" || exchange.includes("FOREX")) return false;
  if (/^[A-Z]{3}[./][A-Z]{3}$/.test(symbol)) return false;
  return true;
}

function latestFxRate(store: LocalStore, currency: string, date: string) {
  if (normaliseCurrency(currency) === "AUD") return 1;
  const rates = store.fxRates
    .filter((rate) => normaliseCurrency(rate.currency) === normaliseCurrency(currency) && rate.rateDate <= date)
    .sort((a, b) => b.rateDate.localeCompare(a.rateDate) || b.retrievedAt.localeCompare(a.retrievedAt));
  return rates[0]?.rateToAud ?? null;
}

function priceBookFromStore(store: LocalStore, limit = 80): PriceBook {
  const instrumentMap = new Map<string, PriceBook["instruments"][number]>();
  for (const position of store.positions) {
    if (!isPriceablePosition(position)) continue;
    const key = `${normaliseSymbol(position.symbol)}:${position.exchange.trim().toUpperCase()}`;
    const current = instrumentMap.get(key);
    if (current) {
      current.positionCount += 1;
      current.quantity += position.quantity;
      current.marketValueAud += position.marketValueAud;
      if (!current.asOfDate || current.asOfDate < position.asOfDate) {
        current.asOfDate = position.asOfDate;
        current.lastPrice = position.lastPrice;
      }
    } else {
      instrumentMap.set(key, {
        symbol: position.symbol,
        exchange: position.exchange,
        name: position.name,
        currency: position.currency,
        assetClass: classifyAsset(position.symbol, `${position.name} ${position.assetClass}`),
        positionCount: 1,
        quantity: position.quantity,
        marketValueAud: position.marketValueAud,
        lastPrice: position.lastPrice,
        asOfDate: position.asOfDate,
      });
    }
  }
  return {
    instruments: [...instrumentMap.values()].sort((a, b) => b.marketValueAud - a.marketValueAud),
    prices: [
      ...store.dailyPrices,
      ...store.platinumPrices.map((price) => ({
        id: `platinum-${price.priceDate}`,
        instrumentId: null,
        symbol: "PLATINUM",
        exchange: "PHYSICAL",
        name: "Physical platinum",
        currency: "AUD",
        close: price.buybackAudPerKg,
        priceDate: price.priceDate,
        source: `${price.provider} buyback`,
        retrievedAt: price.retrievedAt,
      } satisfies StoredDailyPrice)),
    ].sort((a, b) => b.priceDate.localeCompare(a.priceDate) || b.retrievedAt.localeCompare(a.retrievedAt)).slice(0, limit),
    fxRates: [...store.fxRates].sort((a, b) => b.rateDate.localeCompare(a.rateDate) || b.retrievedAt.localeCompare(a.retrievedAt)).slice(0, limit),
  };
}

function dashboardFromStore(store: LocalStore, scope: Scope): DashboardData {
  const ownerType = ownerForScope(scope);
  const importedPositions = store.positions.filter(position => !ownerType || position.ownerType === ownerType);
  const manualAssets = store.manualAssets.filter(asset => !ownerType || asset.ownerType === ownerType);
  const cashAccounts = store.cashAccounts.filter(account => !ownerType || account.ownerType === ownerType);
  const transactions = store.transactions.filter(transaction => !ownerType || transaction.ownerType === ownerType);
  const imports = store.imports.filter(record => !ownerType || record.ownerType === ownerType);

  return buildDashboardModel({
    scope,
    storageMode: "local-file",
    positions: importedPositions,
    manualAssets,
    cashAccounts,
    transactions,
    imports,
    snapshots: store.snapshots.filter(snapshot => !ownerType || snapshot.ownerType === ownerType),
    syncRuns: store.syncRuns,
    allocationTargets: store.allocationTargets,
  });
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

    const positionReport = report.openPositions.length
      ? report
      : {
          ...report,
          transactions: store.transactions.filter(transaction =>
            transaction.ownerType === ownerType && transaction.broker === "IBKR" && transaction.accountKey === accountKey
          ),
        };
    replaceIbkrOpenPositions(store, positionReport, ownerType, accountKey);
    replaceIbkrOpenOrders(store, report, ownerType, accountKey);
    replaceIbkrNavSnapshots(store, report, ownerType);
    upsertIbkrCash(store, report, ownerType);

    const importRecord = store.imports.find(record => record.source === "IBKR" && record.ownerType === ownerType && record.accountKey === accountKey);
    const recordCount = store.transactions.filter(transaction => transaction.ownerType === ownerType && transaction.broker === "IBKR" && transaction.accountKey === accountKey).length;
    if (importRecord) { importRecord.importedAt = new Date().toISOString(); importRecord.recordCount = recordCount; }
    else store.imports.push({ id: randomUUID(), source: "IBKR", ownerType, importedAt: new Date().toISOString(), recordCount, accountKey });

    captureSnapshot(store, ownerType);
    await writeStore(store);
    const positionCount = store.positions.filter(position => position.ownerType === ownerType && position.broker === "IBKR" && position.accountKey === accountKey).length;
    const valuationSource = report.openPositions.length
      ? "open_positions_with_trade_overlay"
      : "trade_cost_basis";
    return { source: "IBKR", ownerType, accountKey: maskAccount(accountKey), imported, duplicates, positions: positionCount, openPositions: report.openPositions.length, openOrders: report.openOrders.length, cashAud: ibkrTotalCashFromComponents(report)?.balanceAud, valuationSource, storageMode: "local-file" };
  }

  async importDirectshares(positions: OpeningPosition[], ownerType: OwnerType): Promise<ImportResult> {
    const store = await readStore();
    const accountKey = positions.find(position => position.externalAccountId)?.externalAccountId || "DIRECTSHARES";
    store.positions = store.positions.filter(position => !(position.ownerType === ownerType && position.broker === "Directshares" && position.accountKey === accountKey));
    const asOfDate = new Date().toISOString().slice(0, 10);
    for (const position of positions) {
      const name = position.name || position.symbol;
      store.positions.push({
        id: randomUUID(), ownerType, broker: "Directshares", accountKey,
        instrumentKey: `Directshares:${position.symbol}:${position.exchange}`, symbol: position.symbol, name,
        exchange: position.exchange, currency: position.currency, assetClass: classifyAsset(position.symbol, name),
        quantity: position.quantity, lastPrice: position.lastPrice, averageCostAud: position.averageCostAud,
        costAud: position.costAud, marketValueAud: position.marketValueAud, dayGainAud: position.dayGainAud,
        pnlAud: position.pnlAud, pnlPercent: position.pnlPercent, valuationBasis: "market", asOfDate, source: "Directshares CSV",
      });
    }

    const importRecord = store.imports.find(record => record.source === "Directshares" && record.ownerType === ownerType && record.accountKey === accountKey);
    if (importRecord) { importRecord.importedAt = new Date().toISOString(); importRecord.recordCount = positions.length; }
    else store.imports.push({ id: randomUUID(), source: "Directshares", ownerType, importedAt: new Date().toISOString(), recordCount: positions.length, accountKey });
    captureSnapshot(store, ownerType);
    await writeStore(store);
    return { source: "Directshares", ownerType, accountKey: maskAccount(accountKey), imported: positions.length, duplicates: 0, positions: positions.length, storageMode: "local-file" };
  }

  async importDirectsharesTransactions(transactions: ImportedTransaction[], ownerType: OwnerType, importSource = "Directshares Contract Notes"): Promise<ImportResult> {
    if (!transactions.length) throw new Error("No Directshares transactions were supplied.");
    const store = await readStore();
    const accountKey = transactions.find(transaction => transaction.externalAccountId)?.externalAccountId || "DIRECTSHARES";
    const existing = new Set(store.transactions.map(transaction => `${transaction.ownerType}:${transaction.broker}:${transaction.accountKey}:${transaction.externalId}`));
    const transactionSources = new Set(transactions.map(transaction => transaction.source));
    let imported = 0;
    let duplicates = 0;

    for (const transaction of transactions) {
      const key = `${ownerType}:Directshares:${accountKey}:${transaction.externalId}`;
      if (existing.has(key)) { duplicates += 1; continue; }
      existing.add(key);
      store.transactions.push({ ...transaction, id: randomUUID(), ownerType, broker: "Directshares", accountKey });
      imported += 1;
    }

    const importRecord = store.imports.find(record => record.source === importSource && record.ownerType === ownerType && record.accountKey === accountKey);
    const recordCount = store.transactions.filter(transaction => transaction.ownerType === ownerType && transaction.broker === "Directshares" && transaction.accountKey === accountKey && transactionSources.has(transaction.source)).length;
    if (importRecord) { importRecord.importedAt = new Date().toISOString(); importRecord.recordCount = recordCount; }
    else store.imports.push({ id: randomUUID(), source: importSource, ownerType, importedAt: new Date().toISOString(), recordCount, accountKey });

    await writeStore(store);
    const positionCount = store.positions.filter(position => position.ownerType === ownerType && position.broker === "Directshares" && position.accountKey === accountKey).length;
    return { source: importSource, ownerType, accountKey: maskAccount(accountKey), imported, duplicates, positions: positionCount, storageMode: "local-file" };
  }

  async listTransactions(ownerType?: OwnerType) {
    const store = await readStore();
    return store.transactions.filter(transaction => !ownerType || transaction.ownerType === ownerType).sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  }

  async listCashAccounts(ownerType?: OwnerType, options: { includeInactive?: boolean } = {}) {
    const store = await readStore();
    return store.cashAccounts
      .filter(account => options.includeInactive || account.isActive !== false)
      .filter(account => !ownerType || account.ownerType === ownerType)
      .sort((a, b) => a.institution.localeCompare(b.institution));
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

  async upsertManualAsset(input: Omit<ManualAsset, "id" | "updatedAt" | "marketValueAud" | "pnlAud" | "pnlPercent" | "costAudPerKg" | "dealerSpreadAudPerKg" | "dealerSpreadPercent"> & { id?: string }) {
    const store = await readStore();
    const existing = input.id ? store.manualAssets.find(asset => asset.id === input.id && asset.ownerType === input.ownerType) : undefined;
    const valuation = buildManualAssetValuation(input);
    const asset: ManualAsset = {
      id: existing?.id ?? randomUUID(), ownerType: input.ownerType, assetType: input.assetType, name: input.name.trim(),
      quantityKg: input.quantityKg, totalCostAud: input.totalCostAud,
      costAudPerKg: valuation.costAudPerKg,
      buybackAudPerKg: input.buybackAudPerKg, retailAudPerKg: input.retailAudPerKg,
      marketValueAud: valuation.marketValueAud, pnlAud: valuation.pnlAud, pnlPercent: valuation.pnlPercent,
      dealerSpreadAudPerKg: valuation.dealerSpreadAudPerKg, dealerSpreadPercent: valuation.dealerSpreadPercent,
      priceProvider: input.priceProvider, priceSourceUrl: input.priceSourceUrl,
      purchaseDate: input.purchaseDate, asOfDate: input.asOfDate, priceRetrievedAt: input.priceRetrievedAt,
      updatedAt: new Date().toISOString(),
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

  async listPriceBook(limit = 80): Promise<PriceBook> {
    return priceBookFromStore(await readStore(), limit);
  }

  async recordDailyPrices(prices: DailyPriceInput[], fxRates: FxRateInput[] = []): Promise<PriceImportResult> {
    const store = await readStore();
    const result: PriceImportResult = {
      imported: 0,
      matchedInstruments: 0,
      updatedPositions: 0,
      updatedCashAccounts: 0,
      fxRates: 0,
      skipped: 0,
      errors: [],
      storageMode: "local-file",
    };
    const now = new Date().toISOString();
    const owners = new Set<OwnerType>();

    const rateInputs = [
      ...fxRates,
      ...prices.filter((price) => price.fxRateToAud).map((price) => ({
        currency: price.currency,
        rateToAud: price.fxRateToAud!,
        rateDate: price.priceDate,
        source: price.source || "Manual",
      })),
    ];
    for (const input of rateInputs) {
      const currency = normaliseCurrency(input.currency);
      if (currency === "AUD") continue;
      const rate: StoredFxRate = {
        id: randomUUID(),
        currency,
        rateToAud: input.rateToAud,
        rateDate: input.rateDate,
        source: input.source.trim() || "Manual",
        retrievedAt: now,
      };
      const existing = store.fxRates.find((item) => item.currency === rate.currency && item.rateDate === rate.rateDate && item.source === rate.source);
      if (existing) Object.assign(existing, rate, { id: existing.id }); else store.fxRates.push(rate);
      result.fxRates += 1;
      for (const account of store.cashAccounts.filter((account) => normaliseCurrency(account.currency) === currency)) {
        account.fxRateToAud = rate.rateToAud;
        account.balanceAud = account.balance * rate.rateToAud;
        account.asOfDate = rate.rateDate;
        account.updatedAt = now;
        owners.add(account.ownerType);
        result.updatedCashAccounts += 1;
      }
    }

    for (const input of prices) {
      const symbol = normaliseSymbol(input.symbol);
      const exchange = input.exchange?.trim().toUpperCase() ?? "";
      const currency = normaliseCurrency(input.currency);
      const matching = store.positions.filter((position) =>
        normaliseSymbol(position.symbol) === symbol && (!exchange || position.exchange.trim().toUpperCase() === exchange)
      );
      if (!matching.length) {
        result.skipped += 1;
        result.errors.push(`${symbol}${exchange ? `:${exchange}` : ""} has no current position to price.`);
        continue;
      }
      const validMatches = matching.filter((position) => normaliseCurrency(position.currency) === currency);
      if (!validMatches.length) {
        result.skipped += matching.length;
        result.errors.push(`${symbol}${exchange ? `:${exchange}` : ""} expects ${matching.map((position) => position.currency).join("/")}, not ${currency}.`);
        continue;
      }
      result.matchedInstruments += 1;
      const rateToAud = currency === "AUD" ? 1 : input.fxRateToAud ?? latestFxRate(store, currency, input.priceDate);
      const priceRecord: StoredDailyPrice = {
        id: randomUUID(),
        instrumentId: null,
        symbol,
        exchange: exchange || validMatches[0].exchange,
        name: validMatches[0].name,
        currency,
        close: input.close,
        priceDate: input.priceDate,
        source: input.source.trim() || "Manual",
        retrievedAt: now,
      };
      const previousPrice = store.dailyPrices
        .filter((item) =>
          normaliseSymbol(item.symbol) === symbol
          && item.exchange.trim().toUpperCase() === priceRecord.exchange.trim().toUpperCase()
          && item.priceDate < input.priceDate
        )
        .sort((a, b) => b.priceDate.localeCompare(a.priceDate) || b.retrievedAt.localeCompare(a.retrievedAt))[0];
      const existing = store.dailyPrices.find((item) =>
        normaliseSymbol(item.symbol) === symbol
        && item.exchange.trim().toUpperCase() === priceRecord.exchange.trim().toUpperCase()
        && item.priceDate === priceRecord.priceDate
        && item.source === priceRecord.source
      );
      if (existing) Object.assign(existing, priceRecord, { id: existing.id }); else store.dailyPrices.push(priceRecord);
      result.imported += 1;
      if (!rateToAud) {
        result.skipped += validMatches.length;
        result.errors.push(`${symbol}${exchange ? `:${exchange}` : ""} was stored but not applied because ${currency}/AUD FX is missing.`);
        continue;
      }
      const previousFxRateToAud = currency === "AUD" ? 1 : previousPrice ? latestFxRate(store, currency, previousPrice.priceDate) : null;
      for (const position of validMatches) {
        const valuation = buildPositionPriceValuation({
          quantity: position.quantity,
          close: input.close,
          fxRateToAud: rateToAud,
          costAud: position.costAud,
          previousClose: previousPrice?.close ?? null,
          previousFxRateToAud,
          previousMarketValueAud: position.marketValueAud,
        });
        position.dayGainAud = valuation.dayGainAud;
        position.lastPrice = input.close;
        position.marketValueAud = valuation.marketValueAud;
        position.pnlAud = valuation.pnlAud;
        position.pnlPercent = valuation.pnlPercent;
        position.valuationBasis = "market";
        position.asOfDate = input.priceDate;
        owners.add(position.ownerType);
        result.updatedPositions += 1;
      }
    }

    store.dailyPrices = store.dailyPrices.slice(-2000);
    store.fxRates = store.fxRates.slice(-1000);
    for (const owner of owners) captureSnapshot(store, owner);
    await writeStore(store);
    return result;
  }

  async getLatestPlatinumPrice(): Promise<PlatinumPrice | null> {
    const store = await readStore();
    return [...store.platinumPrices].sort((a, b) => b.retrievedAt.localeCompare(a.retrievedAt))[0] ?? null;
  }

  async recordPlatinumPrice(price: PlatinumPrice): Promise<PlatinumPrice> {
    const store = await readStore();
    const existing = store.platinumPrices.find(item => item.provider === price.provider && item.productKey === price.productKey && item.priceDate === price.priceDate);
    if (existing) Object.assign(existing, price); else store.platinumPrices.push(price);
    const owners = new Set<OwnerType>();
    for (const asset of store.manualAssets) {
      if (asset.assetType !== "PLATINUM") continue;
      asset.buybackAudPerKg = price.buybackAudPerKg;
      asset.retailAudPerKg = price.retailAudPerKg;
      const valuation = buildManualAssetValuation(asset);
      asset.costAudPerKg = valuation.costAudPerKg;
      asset.marketValueAud = valuation.marketValueAud;
      asset.pnlAud = valuation.pnlAud;
      asset.pnlPercent = valuation.pnlPercent;
      asset.dealerSpreadAudPerKg = valuation.dealerSpreadAudPerKg;
      asset.dealerSpreadPercent = valuation.dealerSpreadPercent;
      asset.priceProvider = price.provider;
      asset.priceSourceUrl = price.sourceUrl;
      asset.asOfDate = price.priceDate;
      asset.priceRetrievedAt = price.retrievedAt;
      asset.updatedAt = new Date().toISOString();
      owners.add(asset.ownerType);
    }
    for (const owner of owners) captureSnapshot(store, owner);
    await writeStore(store);
    return price;
  }

  async recordSyncRun(input: NewSyncRun): Promise<SyncRun> {
    const store = await readStore();
    const run = buildSyncRun(input);
    store.syncRuns.push(run);
    store.syncRuns = store.syncRuns.sort((a, b) => a.finishedAt.localeCompare(b.finishedAt)).slice(-500);
    await writeStore(store);
    return run;
  }

  async listOpenOrders(ownerType?: OwnerType): Promise<StoredOpenOrder[]> {
    const store = await readStore();
    return store.openOrders
      .filter(order => !ownerType || order.ownerType === ownerType)
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? b.asOfDate).localeCompare(a.updatedAt ?? a.createdAt ?? a.asOfDate));
  }

  async listSyncRuns(limit = 20, ownerType?: OwnerType): Promise<SyncRun[]> {
    const store = await readStore();
    return [...store.syncRuns]
      .filter(run => !ownerType || !run.ownerType || run.ownerType === ownerType)
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
      .slice(0, limit);
  }

  async listAllocationTargets(): Promise<AllocationTarget[]> {
    const store = await readStore();
    return normaliseAllocationTargets(store.allocationTargets);
  }

  async upsertAllocationTargets(targets: Array<Omit<AllocationTarget, "updatedAt">>): Promise<AllocationTarget[]> {
    const store = await readStore();
    const now = new Date().toISOString();
    store.allocationTargets = normaliseAllocationTargets(targets.map((target) => ({ ...target, updatedAt: now })));
    await writeStore(store);
    return store.allocationTargets;
  }

  async listMinerFundamentals(symbols?: string[]): Promise<MinerFundamentals[]> {
    const store = await readStore();
    const requested = symbols?.map(normaliseSymbol);
    return [...store.minerFundamentals]
      .filter((item) => !requested?.length || requested.includes(normaliseSymbol(item.symbol)))
      .sort((a, b) => normaliseSymbol(a.symbol).localeCompare(normaliseSymbol(b.symbol)));
  }

  async upsertMinerFundamentals(input: MinerFundamentalsInput): Promise<MinerFundamentals> {
    const store = await readStore();
    const now = new Date().toISOString();
    const record: MinerFundamentals = { ...input, symbol: normaliseSymbol(input.symbol), updatedAt: now };
    const existing = store.minerFundamentals.find((item) => normaliseSymbol(item.symbol) === record.symbol);
    if (existing) Object.assign(existing, record); else store.minerFundamentals.push(record);
    await writeStore(store);
    return record;
  }

  async listStructuralLevels(symbols?: string[]): Promise<StructuralLevel[]> {
    const store = await readStore();
    const requested = symbols?.map(normaliseSymbol).filter(Boolean) ?? [];
    return [...store.structuralLevels]
      .filter((item) => !requested.length || requested.includes(normaliseSymbol(item.symbol)) || requested.includes(normaliseSymbol(item.comparisonSymbol)))
      .sort((a, b) => normaliseSymbol(a.symbol).localeCompare(normaliseSymbol(b.symbol)) || a.timeframe.localeCompare(b.timeframe) || a.level - b.level);
  }

  async upsertStructuralLevel(input: StructuralLevelInput): Promise<StructuralLevel> {
    const store = await readStore();
    const now = new Date().toISOString();
    const record: StructuralLevel = {
      ...input,
      id: input.id ?? randomUUID(),
      symbol: normaliseSymbol(input.symbol),
      comparisonSymbol: normaliseSymbol(input.comparisonSymbol),
      updatedAt: now,
    };
    const existing = store.structuralLevels.find((item) => item.id === record.id);
    if (existing) Object.assign(existing, record); else store.structuralLevels.push(record);
    await writeStore(store);
    return record;
  }

  async deleteStructuralLevel(id: string): Promise<void> {
    const store = await readStore();
    store.structuralLevels = store.structuralLevels.filter((item) => item.id !== id);
    await writeStore(store);
  }

  async dashboard(scope: Scope) { return dashboardFromStore(await readStore(), scope); }
}
