import type { QuoteProvider } from "@/lib/integrations/market-data";
import { runFullSync, runMarketDataOnlySync } from "@/lib/sync/full-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const quoteProviders = new Set<QuoteProvider>(["auto", "eodhd", "globalx", "yahoo", "stooq"]);

function quoteProviderFromRequest(request: Request): QuoteProvider {
  const value = new URL(request.url).searchParams.get("provider")?.toLowerCase();
  return value && quoteProviders.has(value as QuoteProvider) ? value as QuoteProvider : "auto";
}

export async function POST(request: Request) {
  const key = request.headers.get("x-sync-key");
  if (!process.env.SYNC_SECRET || key !== process.env.SYNC_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (new URL(request.url).searchParams.get("task") === "market-data") {
    const output = await runMarketDataOnlySync("scheduled", quoteProviderFromRequest(request));
    return Response.json(output, { status: output.errors.length ? 207 : 200 });
  }

  const output = await runFullSync("scheduled", quoteProviderFromRequest(request));
  return Response.json(output, { status: output.errors.length ? 207 : 200 });
}
