import { NextResponse } from "next/server";
import { RARI_DEFAULT_DEFINITION, rariRange, rariSnapshot } from "@/lib/regime/rari";
import { loadRariResults } from "@/lib/regime/rari-service";
import { getStorage, type StoredDailyPrice } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const ranges = new Set(["1Y", "3Y", "5Y", "10Y", "MAX"]);

export async function GET(request: Request) {
  try {
    const storage = getStorage();
    const rangeParam = new URL(request.url).searchParams.get("range")?.toUpperCase() ?? "3Y";
    const range = ranges.has(rangeParam) ? rangeParam as "1Y" | "3Y" | "5Y" | "10Y" | "MAX" : "3Y";
    const results = await loadRariResults(storage);
    const points = rariRange(results, range);
    const book = await storage.listPriceBook(20000);
    return NextResponse.json({
      range,
      points,
      spx: spxOverlay(book.prices, points.map((point) => point.date)),
      current: rariSnapshot(results, RARI_DEFAULT_DEFINITION).current,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load RARI history." }, { status: 500 });
  }
}

function spxOverlay(prices: StoredDailyPrice[], dates: string[]) {
  const wanted = new Set(dates);
  const byDate = new Map<string, StoredDailyPrice>();
  for (const price of prices) {
    if (price.symbol.toUpperCase() !== "SPY" || price.exchange.toUpperCase() !== "AMEX" || !wanted.has(price.priceDate)) continue;
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
