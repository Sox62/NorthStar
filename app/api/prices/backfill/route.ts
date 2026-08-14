import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchHistoricalMarketPrices } from "@/lib/integrations/market-data";
import { getStorage, type PriceableInstrument } from "@/lib/storage";
import { ensureBenchmarkPriceInstrumentsPostgres } from "@/lib/storage/postgres/pricing";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  symbols: z.array(z.string().trim().min(1)).optional(),
  range: z.enum(["1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"]).default("max"),
});

function normaliseKey(value: string) {
  return value.trim().toUpperCase();
}
const BENCHMARK_BACKFILL_INSTRUMENTS: Record<string, PriceableInstrument> = {
  GOLD: benchmarkInstrument("GOLD", "TVC", "Gold spot", "USD", "Reserve benchmark"),
  SILVER: benchmarkInstrument("SILVER", "TVC", "Silver spot", "USD", "Commodity benchmark"),
  PLATINUM: benchmarkInstrument("PLATINUM", "TVC", "Platinum spot", "USD", "Commodity benchmark"),
  USOIL: benchmarkInstrument("USOIL", "TVC", "WTI crude oil", "USD", "Commodity benchmark"),
  SLVM: benchmarkInstrument("SLVM", "ASX", "Silver miners ETF", "AUD", "Silver miners"),
  SIL: benchmarkInstrument("SIL", "AMEX", "Global X Silver Miners ETF", "USD", "Silver miners"),
  SILJ: benchmarkInstrument("SILJ", "AMEX", "Amplify Junior Silver Miners ETF", "USD", "Silver miners"),
  GDX: benchmarkInstrument("GDX", "AMEX", "VanEck Gold Miners ETF", "USD", "Gold miners"),
  URNM: benchmarkInstrument("URNM", "AMEX", "Sprott Uranium Miners ETF", "USD", "Uranium miners"),
  URA: benchmarkInstrument("URA", "AMEX", "Global X Uranium ETF", "USD", "Uranium miners"),
  CCJ: benchmarkInstrument("CCJ", "NYSE", "Cameco", "USD", "Uranium miners"),
  XLE: benchmarkInstrument("XLE", "AMEX", "Energy Select Sector SPDR", "USD", "Oil"),
  XOP: benchmarkInstrument("XOP", "AMEX", "SPDR Oil & Gas Exploration ETF", "USD", "Oil"),
  XOM: benchmarkInstrument("XOM", "NYSE", "Exxon Mobil", "USD", "Oil"),
  CVX: benchmarkInstrument("CVX", "NYSE", "Chevron", "USD", "Oil"),
  SPY: benchmarkInstrument("SPY", "AMEX", "SPDR S&P 500 ETF", "USD", "Broad equities"),
  QQQ: benchmarkInstrument("QQQ", "NASDAQ", "Invesco QQQ Trust", "USD", "Technology"),
  RSP: benchmarkInstrument("RSP", "AMEX", "Invesco S&P 500 Equal Weight ETF", "USD", "Broad equities"),
};

function benchmarkInstrument(symbol: string, exchange: string, name: string, currency: string, assetClass: string): PriceableInstrument {
  return { symbol, exchange, name, currency, assetClass, positionCount: 0, quantity: 0, marketValueAud: 0, lastPrice: null, asOfDate: null };
}

function benchmarkRequests(requested: Set<string>) {
  const instruments = new Map<string, PriceableInstrument>();
  for (const key of requested) {
    const symbol = key.split(":")[0];
    const instrument = BENCHMARK_BACKFILL_INSTRUMENTS[symbol];
    if (instrument) instruments.set(instrument.symbol + ":" + instrument.exchange, instrument);
  }
  return [...instruments.values()];
}

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  const storage = getStorage();
  try {
    const input = bodySchema.parse(await request.json().catch(() => ({})));
    const book = await storage.listPriceBook(300);
    const requested = new Set((input.symbols ?? []).map(normaliseKey));
    const heldInstruments = requested.size
      ? book.instruments.filter((instrument) => requested.has(normaliseKey(instrument.symbol)) || requested.has(normaliseKey(instrument.symbol) + ":" + normaliseKey(instrument.exchange)))
      : book.instruments;
    const benchmarkInstruments = requested.size ? benchmarkRequests(requested) : [];
    const instruments = [...new Map([...heldInstruments, ...benchmarkInstruments].map((instrument) => [normaliseKey(instrument.symbol) + ":" + normaliseKey(instrument.exchange), instrument])).values()];

    if (!instruments.length) throw new Error("No current instruments or supported benchmark symbols are available for historical price backfill.");

    const history = await fetchHistoricalMarketPrices(instruments, input.range);
    if (process.env.DATABASE_URL && benchmarkInstruments.length && history.prices.length) {
      const returned = new Set(history.prices.map((price) => normaliseKey(price.symbol) + ":" + normaliseKey(price.exchange ?? "")));
      await ensureBenchmarkPriceInstrumentsPostgres(benchmarkInstruments.filter((instrument) => returned.has(normaliseKey(instrument.symbol) + ":" + normaliseKey(instrument.exchange))));
    }
    const stored = history.prices.length || history.fxRates.length
      ? await storage.recordDailyPrices(history.prices, history.fxRates)
      : { imported: 0, matchedInstruments: 0, updatedPositions: 0, updatedCashAccounts: 0, fxRates: 0, skipped: 0, errors: [], storageMode: "postgresql" as const };
    const errors = [...history.failures.map((failure) => `${failure.symbol}:${failure.exchange} ${failure.message}`), ...stored.errors];
    const status = history.prices.length && errors.length ? "partial" : history.prices.length ? "success" : "failed";
    const message = history.prices.length
      ? `${stored.imported} historical closes stored for ${instruments.length} instrument${instruments.length === 1 ? "" : "s"}.`
      : errors.join("; ") || "No historical closes were returned.";

    await storage.recordSyncRun({
      source: "Market Data Backfill",
      trigger: "manual",
      status,
      startedAt,
      recordCount: stored.imported,
      positionCount: stored.updatedPositions,
      message: status === "failed" ? null : message,
      error: status === "failed" ? message : null,
    });

    return NextResponse.json({ ...stored, backfilled: true, range: input.range, instruments: instruments.length, failures: history.failures, errors, status }, { status: status === "failed" ? 502 : status === "partial" ? 207 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to backfill historical prices.";
    await storage.recordSyncRun({ source: "Market Data Backfill", trigger: "manual", status: "failed", startedAt, error: message }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
