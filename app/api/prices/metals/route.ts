import { NextResponse } from "next/server";
import { fetchMetalSpotQuotes } from "@/lib/integrations/market-data";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await fetchMetalSpotQuotes();
    return NextResponse.json(result, {
      headers: {
        "cache-control": "private, max-age=120",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { quotes: [], errors: [error instanceof Error ? error.message : "Unable to load metals spot prices."], source: "Swissquote" },
      { status: 502 },
    );
  }
}
