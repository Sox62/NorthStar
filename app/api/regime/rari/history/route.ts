import { NextResponse } from "next/server";
import { RARI_DEFAULT_DEFINITION, rariRange, rariSnapshot, type RariRange } from "@/lib/regime/rari";
import { loadRariResults } from "@/lib/regime/rari-service";
import { getStorage, type StoredDailyPrice } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const ranges = new Set(["3M", "6M", "1Y", "3Y", "5Y", "10Y", "MAX"]);

export async function GET(request: Request) {
  try {
    const storage = getStorage();
    const rangeParam = new URL(request.url).searchParams.get("range")?.toUpperCase() ?? "1Y";
    const range = ranges.has(rangeParam) ? rangeParam as RariRange : "1Y";
    const results = await loadRariResults(storage);
    const points = rariRange(results, range);
    const book = await storage.listPriceBook(20000);
    return NextResponse.json({
      range,
      points,
      spx: indexedOverlay(book.prices, points.map((point) => point.date), "SPY", "AMEX"),
      gold: indexedOverlay(book.prices, points.map((point) => point.date), "GOLD", "TVC"),
      current: rariSnapshot(results, RARI_DEFAULT_DEFINITION).current,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load RARI history." }, { status: 500 });
  }
}

function indexedOverlay(prices: StoredDailyPrice[], dates: string[], symbol: string, exchange: string) {
  const wanted = new Set(dates);
  const byDate = new Map<string, StoredDailyPrice>();
  for (const price of prices) {
    if (price.symbol.toUpperCase() !== symbol || price.exchange.toUpperCase() !== exchange || !wanted.has(price.priceDate)) continue;
    const current = byDate.get(price.priceDate);
    if (!current || current.retrievedAt < price.retrievedAt) byDate.set(price.priceDate, price);
  }
  const rows = [...byDate.values()].sort((left, right) => left.priceDate.localeCompare(right.priceDate));
  const first = rows.find((row) => row.close > 0)?.close ?? null;
  return rows.map((row) => ({
    date: row.priceDate,
    close: row.close,
    indexed: first ? row.close / first * 100 : null,
  }));
}
