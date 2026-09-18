import { buildDashboardModel, ownerForScope } from "@/lib/core/accounting";
import { classifyAsset } from "./classify";
import type { DashboardData, LocalStore, PriceBook, Scope, StoredDailyPrice, StoredPosition } from "./types";

export function normaliseCurrency(value: string) {
  return value.trim().toUpperCase();
}

export function normaliseSymbol(value: string) {
  return value.trim().toUpperCase();
}

function isPriceablePosition(position: StoredPosition) {
  const symbol = normaliseSymbol(position.symbol);
  const exchange = position.exchange.trim().toUpperCase();
  if (exchange === "IDEALFX" || exchange.includes("FOREX")) return false;
  if (/^[A-Z]{3}[./][A-Z]{3}$/.test(symbol)) return false;
  return true;
}

export function latestFxRate(store: LocalStore, currency: string, date: string) {
  if (normaliseCurrency(currency) === "AUD") return 1;
  const rates = store.fxRates
    .filter((rate) => normaliseCurrency(rate.currency) === normaliseCurrency(currency) && rate.rateDate <= date)
    .sort((a, b) => b.rateDate.localeCompare(a.rateDate) || b.retrievedAt.localeCompare(a.retrievedAt));
  return rates[0]?.rateToAud ?? null;
}

export function priceBookFromStore(store: LocalStore, limit = 80): PriceBook {
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

export function dashboardFromStore(store: LocalStore, scope: Scope): DashboardData {
  const ownerType = ownerForScope(scope);
  const importedPositions = store.positions.filter(position => !ownerType || position.ownerType === ownerType);
  const manualAssets = store.manualAssets.filter(asset => !ownerType || asset.ownerType === ownerType);
  const cashAccounts = store.cashAccounts.filter(account => !ownerType || account.ownerType === ownerType);
  const transactions = store.transactions.filter(transaction => !ownerType || transaction.ownerType === ownerType);
  const imports = store.imports.filter(record => !ownerType || record.ownerType === ownerType);

  return buildDashboardModel({
    sectorOverrides: store.sectorOverrides,
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
