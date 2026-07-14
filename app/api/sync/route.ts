import { fetchAbcPlatinumPrice } from "@/lib/integrations/abc-bullion";
import { fetchIbkrFlexReport } from "@/lib/integrations/ibkr";
import { getStorage, type OwnerType } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const key = request.headers.get("x-sync-key");
  if (!process.env.SYNC_SECRET || key !== process.env.SYNC_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storage = getStorage();
  const output: Record<string, unknown> = { syncedAt: new Date().toISOString() };
  const errors: string[] = [];

  if (process.env.IBKR_FLEX_TOKEN && process.env.IBKR_FLEX_QUERY_ID) {
    try {
      const owner = ((process.env.IBKR_FLEX_OWNER || "SMSF").toUpperCase() === "PERSONAL" ? "PERSONAL" : "SMSF") as OwnerType;
      const report = await fetchIbkrFlexReport();
      output.ibkr = await storage.importIbkr(report, owner);
    } catch (error) {
      errors.push(`IBKR: ${error instanceof Error ? error.message : "Unknown sync error"}`);
    }
  }

  try {
    const price = await fetchAbcPlatinumPrice();
    output.platinum = await storage.recordPlatinumPrice(price);
  } catch (error) {
    errors.push(`ABC Bullion: ${error instanceof Error ? error.message : "Unknown price error"}`);
  }

  return Response.json({ ok: errors.length === 0, ...output, errors }, { status: errors.length ? 207 : 200 });
}
