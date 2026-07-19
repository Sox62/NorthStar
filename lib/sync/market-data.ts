import { refreshMarketQuotes, type QuoteProvider } from "@/lib/integrations/market-data";
import type { PriceImportResult, StorageAdapter, SyncStatus, SyncTrigger } from "@/lib/storage/types";

export type MarketDataSyncResult = {
  configured: boolean;
  provider: QuoteProvider;
  status: SyncStatus;
  instruments: number;
  quotes: number;
  fxRates: number;
  updatedPositions: number;
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
  if (!book.instruments.length) {
    const message = "No current instruments are available for quote refresh.";
    await storage.recordSyncRun({ source: "Market Data", trigger, status: "skipped", startedAt, message });
    return { configured, provider, status: "skipped", instruments: 0, quotes: 0, fxRates: 0, updatedPositions: 0, errors: [], message };
  }

  const quotes = await refreshMarketQuotes(book.instruments, provider);
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

  return {
    configured: quotes.providerConfigured,
    provider,
    status,
    instruments: book.instruments.length,
    quotes: quotes.prices.length,
    fxRates: quotes.fxRates.length,
    updatedPositions: stored.updatedPositions,
    errors,
    message,
    storageMode: stored.storageMode,
  };
}
