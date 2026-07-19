import { NextResponse } from "next/server";
import { z } from "zod";
import { refreshMarketQuotes } from "@/lib/integrations/market-data";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const refreshSchema = z.object({
  symbols: z.array(z.string().trim().min(1)).optional(),
  provider: z.enum(["auto", "eodhd", "yahoo", "stooq"]).default("auto"),
});

function normaliseKey(value: string) {
  return value.trim().toUpperCase();
}

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  const storage = getStorage();
  try {
    const input = refreshSchema.parse(await request.json().catch(() => ({})));
    const book = await storage.listPriceBook(200);
    const requested = new Set((input.symbols ?? []).map(normaliseKey));
    const instruments = requested.size
      ? book.instruments.filter((instrument) => requested.has(normaliseKey(instrument.symbol)) || requested.has(`${normaliseKey(instrument.symbol)}:${normaliseKey(instrument.exchange)}`))
      : book.instruments;

    if (!instruments.length) throw new Error("No current instruments are available for quote refresh.");

    const quotes = await refreshMarketQuotes(instruments, input.provider);
    const stored = quotes.prices.length || quotes.fxRates.length
      ? await storage.recordDailyPrices(quotes.prices, quotes.fxRates)
      : { imported: 0, matchedInstruments: 0, updatedPositions: 0, updatedCashAccounts: 0, fxRates: 0, skipped: 0, errors: [], storageMode: "postgresql" as const };
    const errors = [...quotes.failures.map((failure) => `${failure.symbol}:${failure.exchange} ${failure.message}`), ...stored.errors];
    const status = quotes.prices.length && errors.length ? "partial" : quotes.prices.length ? "success" : "failed";

    await storage.recordSyncRun({
      source: "Market Data",
      trigger: "manual",
      status,
      startedAt,
      recordCount: quotes.prices.length,
      positionCount: stored.updatedPositions,
      message: quotes.prices.length
        ? `${stored.updatedPositions} positions updated from ${quotes.prices.length} delayed quote${quotes.prices.length === 1 ? "" : "s"}.`
        : null,
      error: status === "failed" ? errors.join("; ") || "No quotes were returned." : null,
    });

    return NextResponse.json({
      refreshed: true,
      providerConfigured: quotes.providerConfigured,
      providers: quotes.providers,
      quotes: quotes.quotes,
      failures: quotes.failures,
      ...stored,
      errors,
      status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refresh market quotes.";
    await storage.recordSyncRun({
      source: "Market Data",
      trigger: "manual",
      status: "failed",
      startedAt,
      error: message,
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
