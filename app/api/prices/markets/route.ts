import { NextResponse } from "next/server";
import { fetchMarketTileQuotes } from "@/lib/integrations/market-tiles";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await fetchMarketTileQuotes();
    return NextResponse.json(result, {
      headers: {
        "cache-control": "private, max-age=120",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { quotes: [], errors: [error instanceof Error ? error.message : "Unable to load market quotes."] },
      { status: 502 },
    );
  }
}
