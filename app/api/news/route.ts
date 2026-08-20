import { NextResponse } from "next/server";
import { fetchCompanyNewsBatch, type NewsInstrument } from "@/lib/integrations/company-news";

export const runtime = "nodejs";

/** Guards against a malformed query asking for hundreds of lookups in one request. */
const MAX_INSTRUMENTS = 60;

/**
 * Instruments arrive as "SYMBOL:EXCHANGE:NAME" because the exchange decides the provider — WGX on
 * the ASX has an announcements feed, the same ticker elsewhere would not — and the name guards the
 * SEC lookup on non-US listings, where a ticker alone can resolve to an unrelated filer.
 */
function parseInstruments(value: string | null): NewsInstrument[] {
  if (!value) return [];
  const seen = new Set<string>();
  const instruments: NewsInstrument[] = [];
  for (const entry of value.split(",")) {
    // The name is the third field and may itself contain colons, so it keeps whatever remains.
    const [symbol, exchange = "", ...rest] = entry.split(":");
    const key = `${symbol?.trim().toUpperCase()}:${exchange.trim().toUpperCase()}`;
    if (!symbol?.trim() || seen.has(key)) continue;
    seen.add(key);
    instruments.push({ symbol: symbol.trim(), exchange: exchange.trim(), name: rest.join(":").trim() || undefined });
    if (instruments.length >= MAX_INSTRUMENTS) break;
  }
  return instruments;
}

export async function GET(request: Request) {
  const instruments = parseInstruments(new URL(request.url).searchParams.get("instruments"));
  if (!instruments.length) {
    return NextResponse.json({ bySymbol: {}, errors: ["No instruments requested."] }, { status: 400 });
  }
  try {
    const result = await fetchCompanyNewsBatch(instruments);
    return NextResponse.json(result, {
      headers: { "cache-control": "private, max-age=300" },
    });
  } catch (error) {
    return NextResponse.json(
      { bySymbol: {}, errors: [error instanceof Error ? error.message : "Unable to load company news."] },
      { status: 502 },
    );
  }
}
