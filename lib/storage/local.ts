import { randomUUID } from "node:crypto";
import type { IbkrFlexReport, ImportedTransaction, OpeningPosition } from "@/lib/integrations/types";
import {
  buildManualAssetValuation,
  buildPositionPriceValuation,
  manualAssetPosition,
  maskAccount,
} from "@/lib/core/accounting";
import { normaliseAllocationTargets } from "@/southernstar/lib/allocation-drift";
import { classifyAsset } from "./classify";
import type { Sector } from "@/southernstar/types";
import { resolveIbkrCurrentPositions } from "./ibkr-positions";
import { dashboardFromStore, latestFxRate, normaliseCurrency, normaliseSymbol, priceBookFromStore } from "./local-analytics";
import { readStore, writeStore } from "./local-store";
import type {
  CashAccount,
  AllocationTarget,
  CompositeIndexResult,
  CompositeIndexResultQuery,
  FundamentalResearchDraft,
  FundamentalResearchDraftInput,
  FundamentalResearchDraftStatus,
  DashboardData,
  ImportResult,
  LocalStore,
  ManualAsset,
  MinerFundamentals,
  PastedOpenOrder,
  PositionRiskPlan,
  PositionRiskPlanInput,
  RiskSnapshot,
  SectorOverride,
  MinerFundamentalsInput,
  StructuralLevel,
  StructuralLevelInput,
  NewSyncRun,
  OwnerType,
  DailyPriceInput,
  FxRateInput,
  PriceBook,
  PriceImportResult,
  PriceImportOptions,
  PlatinumPrice,
  Scope,
  Snapshot,
  StoredDailyPrice,
  StoredFxRate,
  StorageAdapter,
  SyncRun,
  StoredOpenOrder,
} from "./types";

export const PASTED_ORDER_SOURCE = "IBKR paste";

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

  async recordDailyPrices(prices: DailyPriceInput[], fxRates: FxRateInput[] = [], options: PriceImportOptions = {}): Promise<PriceImportResult> {
    const store = await readStore();
    const updatePositions = options.updatePositions !== false;
    const updateCashAccounts = options.updateCashAccounts !== false;
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
      if (updateCashAccounts) {
        for (const account of store.cashAccounts.filter((account) => normaliseCurrency(account.currency) === currency)) {
          account.fxRateToAud = rate.rateToAud;
          account.balanceAud = account.balance * rate.rateToAud;
          account.asOfDate = rate.rateDate;
          account.updatedAt = now;
          owners.add(account.ownerType);
          result.updatedCashAccounts += 1;
        }
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
        const priceRecord: StoredDailyPrice = {
          id: randomUUID(),
          instrumentId: null,
          symbol,
          exchange,
          name: symbol,
          currency,
          close: input.close,
          priceDate: input.priceDate,
          source: input.source.trim() || "Manual",
          retrievedAt: now,
        };
        const existing = store.dailyPrices.find((item) =>
          normaliseSymbol(item.symbol) === symbol
          && item.exchange.trim().toUpperCase() === priceRecord.exchange.trim().toUpperCase()
          && item.priceDate === priceRecord.priceDate
          && item.source === priceRecord.source
        );
        if (existing) Object.assign(existing, priceRecord, { id: existing.id }); else store.dailyPrices.push(priceRecord);
        result.imported += 1;
        continue;
      }
      const validMatches = matching.filter((position) => normaliseCurrency(position.currency) === currency);
      if (!validMatches.length) {
        result.skipped += matching.length;
        result.errors.push(`${symbol}${exchange ? `:${exchange}` : ""} expects ${matching.map((position) => position.currency).join("/")}, not ${currency}.`);
        continue;
      }
      result.skipped += matching.length - validMatches.length;
      result.matchedInstruments += 1;
      const rateToAud = currency === "AUD" ? 1 : updatePositions ? input.fxRateToAud ?? latestFxRate(store, currency, input.priceDate) : null;
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
      if (!updatePositions) continue;
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

  async listCompositeIndexResults(definitionId: string, options: CompositeIndexResultQuery = {}): Promise<CompositeIndexResult[]> {
    const store = await readStore();
    const rows = store.compositeIndexResults
      .filter((row) => row.definitionId === definitionId)
      .filter((row) => !options.calculationVersion || row.calculationVersion === options.calculationVersion)
      .filter((row) => !options.from || row.date >= options.from)
      .filter((row) => !options.to || row.date <= options.to)
      .sort((left, right) => left.date.localeCompare(right.date) || left.calculatedAt.localeCompare(right.calculatedAt));
    return options.limit ? rows.slice(-Math.max(1, options.limit)) : rows;
  }

  async recordCompositeIndexResults(results: CompositeIndexResult[]): Promise<number> {
    if (!results.length) return 0;
    const store = await readStore();
    const byKey = new Map(store.compositeIndexResults.map((row) => [`${row.definitionId}:${row.date}:${row.calculationVersion}`, row]));
    for (const result of results) {
      byKey.set(`${result.definitionId}:${result.date}:${result.calculationVersion}`, result);
    }
    store.compositeIndexResults = [...byKey.values()]
      .sort((left, right) => left.definitionId.localeCompare(right.definitionId) || left.date.localeCompare(right.date))
      .slice(-10000);
    await writeStore(store);
    return results.length;
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

  async replacePastedOpenOrders(ownerType: OwnerType, orders: PastedOpenOrder[]): Promise<number> {
    const store = await readStore();
    // Only the pasted set is replaced; Flex-sourced rows are left alone, and the Flex import
    // likewise only clears its own source, so the two cannot wipe each other.
    store.openOrders = store.openOrders.filter(order => !(order.ownerType === ownerType && order.source === PASTED_ORDER_SOURCE));
    const asOfDate = new Date().toISOString().slice(0, 10);
    const updatedAt = new Date().toISOString();
    for (const order of orders) {
      store.openOrders.push({
        id: randomUUID(), ownerType, broker: "IBKR", accountKey: order.accountKey,
        orderId: order.orderId, conid: order.conid, symbol: order.symbol, name: order.name,
        exchange: order.exchange, currency: order.currency, side: order.side, status: order.status,
        orderType: order.orderType, timeInForce: order.timeInForce,
        totalQuantity: order.totalQuantity, filledQuantity: order.filledQuantity,
        remainingQuantity: order.remainingQuantity, limitPrice: order.limitPrice,
        stopPrice: order.stopPrice, averagePrice: order.averagePrice,
        description: order.description, createdAt: null, updatedAt, asOfDate,
        source: PASTED_ORDER_SOURCE, raw: order.raw,
      });
    }
    await writeStore(store);
    return orders.length;
  }

  async listOpenOrders(ownerType?: OwnerType): Promise<StoredOpenOrder[]> {
    const store = await readStore();
    return store.openOrders
      .filter(order => !ownerType || order.ownerType === ownerType)
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? b.asOfDate).localeCompare(a.updatedAt ?? a.createdAt ?? a.asOfDate));
  }

  async listPositionRiskPlans(ownerType?: OwnerType): Promise<PositionRiskPlan[]> {
    const store = await readStore();
    return [...(store.riskPlans ?? [])]
      .filter(plan => !ownerType || plan.ownerType === ownerType)
      .sort((left, right) => left.symbol.localeCompare(right.symbol) || left.accountKey.localeCompare(right.accountKey));
  }

  async upsertPositionRiskPlan(input: PositionRiskPlanInput): Promise<PositionRiskPlan> {
    const store = await readStore();
    const position = input.positionId
      ? store.positions.find((item) => item.id === input.positionId)
      : store.positions.find((item) =>
        (!input.ownerType || item.ownerType === input.ownerType)
        && (!input.broker || item.broker === input.broker)
        && (!input.accountKey || item.accountKey === input.accountKey)
        && normaliseSymbol(item.symbol) === normaliseSymbol(input.symbol ?? "")
        && item.exchange.trim().toUpperCase() === (input.exchange ?? item.exchange).trim().toUpperCase()
      );
    if (!position) throw new Error("Position not found for risk plan.");

    const now = new Date().toISOString();
    const existingIndex = (store.riskPlans ?? []).findIndex((plan) =>
      (input.id && plan.id === input.id)
      || (
        plan.ownerType === position.ownerType
        && plan.broker === position.broker
        && plan.accountKey === position.accountKey
        && plan.instrumentKey === position.instrumentKey
      )
    );
    const existing = existingIndex >= 0 ? store.riskPlans[existingIndex] : null;
    const record: PositionRiskPlan = {
      id: existing?.id ?? input.id ?? randomUUID(),
      ownerType: position.ownerType,
      broker: position.broker,
      accountKey: position.accountKey,
      positionId: position.id,
      instrumentKey: position.instrumentKey,
      symbol: position.symbol,
      name: position.name,
      exchange: position.exchange,
      currency: position.currency,
      stopType: input.stopType,
      plannedStopPrice: input.plannedStopPrice ?? null,
      plannedTargetPrice: input.plannedTargetPrice ?? null,
      rationale: input.rationale?.trim() || null,
      invalidationNotes: input.invalidationNotes?.trim() || null,
      sectorBenchmarkSymbol: input.sectorBenchmarkSymbol?.trim().toUpperCase() || null,
      reviewStatus: input.reviewStatus?.trim() || null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existingIndex >= 0) store.riskPlans[existingIndex] = record;
    else store.riskPlans = [...(store.riskPlans ?? []), record];
    await writeStore(store);
    return record;
  }

  async listRiskSnapshots(scope?: Scope, limit = 120): Promise<RiskSnapshot[]> {
    const store = await readStore();
    return [...(store.riskSnapshots ?? [])]
      .filter(snapshot => !scope || snapshot.scope === scope)
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
      .slice(0, Math.max(1, Math.min(500, limit)));
  }

  async recordRiskSnapshot(input: Omit<RiskSnapshot, "id" | "capturedAt"> & { capturedAt?: string }): Promise<RiskSnapshot> {
    const store = await readStore();
    const snapshot: RiskSnapshot = { ...input, id: randomUUID(), capturedAt: input.capturedAt ?? new Date().toISOString() };
    store.riskSnapshots = [...(store.riskSnapshots ?? []), snapshot]
      .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
      .slice(-1000);
    await writeStore(store);
    return snapshot;
  }

  async listSyncRuns(limit = 20, ownerType?: OwnerType): Promise<SyncRun[]> {
    const store = await readStore();
    return [...store.syncRuns]
      .filter(run => !ownerType || !run.ownerType || run.ownerType === ownerType)
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
      .slice(0, limit);
  }

  async listSectorOverrides(): Promise<SectorOverride[]> {
    const store = await readStore();
    return [...store.sectorOverrides].sort((left, right) => left.symbol.localeCompare(right.symbol));
  }

  async setSectorOverride(symbol: string, sector: Sector): Promise<SectorOverride> {
    const store = await readStore();
    const key = symbol.trim().toUpperCase();
    const record: SectorOverride = { symbol: key, sector, updatedAt: new Date().toISOString() };
    const existing = store.sectorOverrides.findIndex((item) => item.symbol.toUpperCase() === key);
    if (existing >= 0) store.sectorOverrides[existing] = record;
    else store.sectorOverrides.push(record);
    await writeStore(store);
    return record;
  }

  async clearSectorOverride(symbol: string): Promise<void> {
    const store = await readStore();
    const key = symbol.trim().toUpperCase();
    store.sectorOverrides = store.sectorOverrides.filter((item) => item.symbol.toUpperCase() !== key);
    await writeStore(store);
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

  async listFundamentalResearchDrafts(status?: FundamentalResearchDraftStatus): Promise<FundamentalResearchDraft[]> {
    const store = await readStore();
    return [...(store.fundamentalResearchDrafts ?? [])]
      .filter((item) => !status || item.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createFundamentalResearchDraft(input: FundamentalResearchDraftInput): Promise<FundamentalResearchDraft> {
    const store = await readStore();
    const now = new Date().toISOString();
    const record: FundamentalResearchDraft = {
      ...input,
      id: randomUUID(),
      symbol: normaliseSymbol(input.symbol),
      status: "pending",
      sourceTitle: input.sourceTitle ?? null,
      sourceDate: input.sourceDate ?? null,
      sourceExcerpt: input.sourceExcerpt ?? null,
      extractor: input.extractor ?? "ai-research",
      confidence: input.confidence ?? null,
      reviewNotes: input.reviewNotes ?? null,
      createdAt: now,
      reviewedAt: null,
    };
    store.fundamentalResearchDrafts = [...(store.fundamentalResearchDrafts ?? []), record];
    await writeStore(store);
    return record;
  }

  async acceptFundamentalResearchDraft(id: string): Promise<MinerFundamentals> {
    const store = await readStore();
    const now = new Date().toISOString();
    const draft = (store.fundamentalResearchDrafts ?? []).find((item) => item.id === id && item.status === "pending");
    if (!draft) throw new Error("Pending fundamentals draft not found");
    const record: MinerFundamentals = {
      symbol: normaliseSymbol(draft.symbol),
      name: draft.name,
      primaryMetal: draft.primaryMetal,
      jurisdiction: draft.jurisdiction,
      projectStage: draft.projectStage,
      productionOz: draft.productionOz,
      aiscUsdPerOz: draft.aiscUsdPerOz,
      quantityUnit: draft.quantityUnit ?? null,
      productionPeriod: draft.productionPeriod ?? null,
      costBasis: draft.costBasis ?? null,
      economicStudyStage: draft.economicStudyStage ?? null,
      economicStudyDate: draft.economicStudyDate ?? null,
      nextStudyStage: draft.nextStudyStage ?? null,
      balanceAsOfDate: draft.balanceAsOfDate ?? null,
      marketCapAsOfDate: draft.marketCapAsOfDate ?? null,
      lastCapitalEventDate: draft.lastCapitalEventDate ?? null,
      lastEquityEventDate: draft.lastEquityEventDate ?? null,
      lastDebtEventDate: draft.lastDebtEventDate ?? null,
      resourceMoz: draft.resourceMoz,
      reserveMoz: draft.reserveMoz,
      cashAud: draft.cashAud,
      debtAud: draft.debtAud,
      marketCapAud: draft.marketCapAud,
      npvAud: draft.npvAud,
      capexAud: draft.capexAud,
      irrPercent: draft.irrPercent,
      jurisdictionScore: draft.jurisdictionScore,
      balanceSheetScore: draft.balanceSheetScore,
      dilutionScore: draft.dilutionScore,
      managementScore: draft.managementScore,
      notes: draft.notes,
      sourceUrl: draft.sourceUrl,
      asOfDate: draft.asOfDate,
      updatedAt: now,
    };
    const existing = store.minerFundamentals.find((item) => normaliseSymbol(item.symbol) === record.symbol);
    if (existing) Object.assign(existing, record); else store.minerFundamentals.push(record);
    draft.status = "accepted";
    draft.reviewedAt = now;
    await writeStore(store);
    return record;
  }

  async rejectFundamentalResearchDraft(id: string, reviewNotes?: string | null): Promise<FundamentalResearchDraft> {
    const store = await readStore();
    const draft = (store.fundamentalResearchDrafts ?? []).find((item) => item.id === id && item.status === "pending");
    if (!draft) throw new Error("Pending fundamentals draft not found");
    draft.status = "rejected";
    draft.reviewNotes = reviewNotes ?? draft.reviewNotes;
    draft.reviewedAt = new Date().toISOString();
    await writeStore(store);
    return draft;
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
