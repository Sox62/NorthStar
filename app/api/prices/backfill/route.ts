import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchHistoricalMarketPrices } from "@/lib/integrations/market-data";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  symbols: z.array(z.string().trim().min(1)).optional(),
  range: z.enum(["1mo", "3mo", "6mo", "1y", "2y"]).default("1y"),
});

function normaliseKey(value: string) {
  return value.trim().toUpperCase();
}

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  const storage = getStorage();
  try {
    const input = bodySchema.parse(await request.json().catch(() => ({})));
    const book = await storage.listPriceBook(300);
    const requested = new Set((input.symbols ?? []).map(normaliseKey));
    const instruments = requested.size
      ? book.instruments.filter((instrument) => requested.has(normaliseKey(instrument.symbol)) || requested.has(`${normaliseKey(instrument.symbol)}:${normaliseKey(instrument.exchange)}`))
      : book.instruments;

    if (!instruments.length) throw new Error("No current instruments are available for historical price backfill.");

    const history = await fetchHistoricalMarketPrices(instruments, input.range);
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
