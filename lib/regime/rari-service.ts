import type { StorageAdapter, SyncStatus, SyncTrigger } from "@/lib/storage";
import {
  calculateRari,
  compositeCalculationToStored,
  RARI_CALCULATION_VERSION,
  RARI_DEFAULT_DEFINITION,
  RARI_DEFINITION_ID,
  RARI_PRICE_INSTRUMENTS,
  rariSnapshot,
} from "./rari";

export type RariRecomputeResult = {
  rows: number;
  persisted: number;
  latestInputDate: string | null;
  currentDate: string | null;
};

export async function loadRariResults(storage: StorageAdapter, options: { force?: boolean; limit?: number } = {}) {
  const existing = await storage.listCompositeIndexResults(RARI_DEFINITION_ID, {
    calculationVersion: RARI_CALCULATION_VERSION,
    limit: options.limit ?? 10000,
  });
  const book = await storage.listPriceBook(20000);
  const latestInputDate = latestRariInputDate(book.prices);
  const latestStoredDate = existing.at(-1)?.date ?? null;
  if (!options.force && existing.length && (!latestInputDate || (latestStoredDate && latestStoredDate >= latestInputDate))) {
    return existing;
  }

  const calculations = calculateRari(book, RARI_DEFAULT_DEFINITION);
  const rows = calculations.map(compositeCalculationToStored);
  if (rows.length) await storage.recordCompositeIndexResults(rows);
  return rows;
}

export async function recomputeRari(storage: StorageAdapter): Promise<RariRecomputeResult> {
  const book = await storage.listPriceBook(20000);
  const latestInputDate = latestRariInputDate(book.prices);
  const rows = calculateRari(book, RARI_DEFAULT_DEFINITION).map(compositeCalculationToStored);
  const persisted = rows.length ? await storage.recordCompositeIndexResults(rows) : 0;
  return {
    rows: rows.length,
    persisted,
    latestInputDate,
    currentDate: rows.at(-1)?.date ?? null,
  };
}

export async function syncRariCompositeIndex(storage: StorageAdapter, trigger: SyncTrigger) {
  const startedAt = new Date().toISOString();
  try {
    const result = await recomputeRari(storage);
    const rows = await storage.listCompositeIndexResults(RARI_DEFINITION_ID, {
      calculationVersion: RARI_CALCULATION_VERSION,
      limit: 10000,
    });
    const snapshot = rariSnapshot(rows, RARI_DEFAULT_DEFINITION);
    const current = snapshot.current;
    const status: SyncStatus = !current
      ? "failed"
      : current.status === "valid"
        ? "success"
        : current.status === "partial" || current.status === "stale"
          ? "partial"
          : "failed";
    const message = current
      ? `RARI ${current.score == null ? "not scored" : current.score.toFixed(0)}${current.regimeLabel ? ` · ${current.regimeLabel}` : ""} as of ${current.date}; ${result.persisted} stored rows.`
      : "RARI could not be calculated from the available market data.";
    await storage.recordSyncRun({
      source: "RARI",
      trigger,
      status,
      startedAt,
      recordCount: result.persisted,
      message: status === "failed" ? null : message,
      error: status === "failed" ? message : null,
    });
    return { ...result, status, current, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown RARI calculation error.";
    await storage.recordSyncRun({
      source: "RARI",
      trigger,
      status: "failed",
      startedAt,
      error: message,
    }).catch(() => {});
    throw error;
  }
}

function latestRariInputDate(prices: Array<{ symbol: string; exchange: string; priceDate: string }>) {
  const keys = new Set(RARI_PRICE_INSTRUMENTS.map((instrument) => key(instrument.symbol, instrument.exchange)));
  return prices
    .filter((price) => keys.has(key(price.symbol, price.exchange)))
    .map((price) => price.priceDate)
    .sort()
    .at(-1) ?? null;
}

function key(symbol: string, exchange: string) {
  return `${symbol.trim().toUpperCase()}:${exchange.trim().toUpperCase()}`;
}
