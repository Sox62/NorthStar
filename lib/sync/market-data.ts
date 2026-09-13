import { refreshMarketQuotes, type QuoteProvider } from "@/lib/integrations/market-data";
import { RARI_PRICE_INSTRUMENTS } from "@/lib/regime/rari";
import { syncRariCompositeIndex } from "@/lib/regime/rari-service";
import type { PriceImportResult, StorageAdapter, SyncStatus, SyncTrigger } from "@/lib/storage/types";
import { ensureBenchmarkPriceInstrumentsPostgres } from "@/lib/storage/postgres/pricing";

export type MarketDataSyncResult = {
  configured: boolean;
  provider: QuoteProvider;
  status: SyncStatus;
  instruments: number;
  quotes: number;
  fxRates: number;
  updatedPositions: number;
  rari?: unknown;
  errors: string[];
  message: string;
  storageMode?: PriceImportResult["storageMode"];
};

function eodhdConfigured() {
  return Boolean(process.env.EODHD_API_TOKEN?.trim() || process.env.MARKETDATA_EODHD_API_TOKEN?.trim());
}

function providerConfigured(provider: QuoteProvider) {
  return provider === "eodhd" ? eodhdConfigured() : true;
}

function autoPriceRefreshEnabled(trigger: SyncTrigger) {
  if (trigger !== "scheduled") return true;
  return !/^(0|false|no)$/i.test(process.env.NORTHSTAR_AUTO_PRICE_REFRESH ?? "");
}

export async function syncMarketData(
  storage: StorageAdapter,
  trigger: SyncTrigger,
  provider: QuoteProvider = "auto",
  limit = 200,
  includeRegimeInputs = true,
): Promise<MarketDataSyncResult> {
  const startedAt = new Date().toISOString();
  if (!autoPriceRefreshEnabled(trigger)) {
    const message = "Scheduled market price refresh is disabled by NORTHSTAR_AUTO_PRICE_REFRESH.";
    await storage.recordSyncRun({ source: "Market Data", trigger, status: "skipped", startedAt, message });
    return { configured: false, provider, status: "skipped", instruments: 0, quotes: 0, fxRates: 0, updatedPositions: 0, errors: [], message };
  }

  const configured = providerConfigured(provider);
  if (!configured) {
    const message = "EODHD_API_TOKEN or MARKETDATA_EODHD_API_TOKEN is not configured.";
    await storage.recordSyncRun({ source: "Market Data", trigger, status: "skipped", startedAt, message });
    return { configured: false, provider, status: "skipped", instruments: 0, quotes: 0, fxRates: 0, updatedPositions: 0, errors: [], message };
  }

  const book = await storage.listPriceBook(limit);
  const instruments = uniqueInstruments([...book.instruments, ...(includeRegimeInputs ? RARI_PRICE_INSTRUMENTS : [])]);
  if (!instruments.length) {
    const message = "No current instruments are available for quote refresh.";
    await storage.recordSyncRun({ source: "Market Data", trigger, status: "skipped", startedAt, message });
    return { configured, provider, status: "skipped", instruments: 0, quotes: 0, fxRates: 0, updatedPositions: 0, errors: [], message };
  }
  if (process.env.DATABASE_URL && includeRegimeInputs) await ensureBenchmarkPriceInstrumentsPostgres(RARI_PRICE_INSTRUMENTS);

  const quotes = await refreshMarketQuotes(instruments, provider);
  const stored = quotes.prices.length || quotes.fxRates.length
    ? await storage.recordDailyPrices(quotes.prices, quotes.fxRates)
    : { imported: 0, matchedInstruments: 0, updatedPositions: 0, updatedCashAccounts: 0, fxRates: 0, skipped: 0, errors: [], storageMode: "postgresql" as const };
  const errors = [...quotes.failures.map((failure) => `${failure.symbol}:${failure.exchange} ${failure.message}`), ...stored.errors];
  const status: SyncStatus = quotes.prices.length && errors.length ? "partial" : quotes.prices.length ? "success" : "failed";
  const message = quotes.prices.length
    ? `${stored.updatedPositions} positions updated from ${quotes.prices.length} delayed quote${quotes.prices.length === 1 ? "" : "s"}.`
    : errors.join("; ") || "No quotes were returned.";

  await storage.recordSyncRun({
    source: "Market Data",
    trigger,
    status,
    startedAt,
    recordCount: quotes.prices.length,
    positionCount: stored.updatedPositions,
    message: status === "failed" ? null : message,
    error: status === "failed" ? message : null,
  });

  let rari: unknown;
  if (includeRegimeInputs) {
    try {
      rari = await syncRariCompositeIndex(storage, trigger);
    } catch (error) {
      errors.push(`RARI: ${error instanceof Error ? error.message : "calculation failed"}`);
    }
  }

  return {
    configured: quotes.providerConfigured,
    provider,
    status,
    instruments: instruments.length,
    quotes: quotes.prices.length,
    fxRates: quotes.fxRates.length,
    updatedPositions: stored.updatedPositions,
    rari,
    errors,
    message,
    storageMode: stored.storageMode,
  };
}

function uniqueInstruments<T extends { symbol: string; exchange: string }>(instruments: T[]) {
  const seen = new Set<string>();
  return instruments.filter((instrument) => {
    const key = `${instrument.symbol.trim().toUpperCase()}:${instrument.exchange.trim().toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
