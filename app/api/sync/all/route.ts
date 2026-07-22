import type { QuoteProvider } from "@/lib/integrations/market-data";
import { runFullSync } from "@/lib/sync/full-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const quoteProviders = new Set<QuoteProvider>(["auto", "eodhd", "globalx", "yahoo", "stooq"]);

function quoteProviderFromRequest(request: Request): QuoteProvider {
  const value = new URL(request.url).searchParams.get("provider")?.toLowerCase();
  return value && quoteProviders.has(value as QuoteProvider) ? value as QuoteProvider : "auto";
}

export async function POST(request: Request) {
  const output = await runFullSync("manual", quoteProviderFromRequest(request));
  return Response.json({ synced: output.ok, ...output }, { status: output.errors.length ? 207 : 200 });
}
