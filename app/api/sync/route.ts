import { fetchAbcPlatinumPrice } from "@/lib/integrations/abc-bullion";
import { fetchIbkrFlexReport } from "@/lib/integrations/ibkr";
import { getStorage, type OwnerType } from "@/lib/storage";
import { syncDirectsharesDividends } from "@/lib/sync/directshares-dividends";
import { syncDirectsharesEmail } from "@/lib/sync/directshares-email";
import { syncMarketData } from "@/lib/sync/market-data";

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
    const startedAt = new Date().toISOString();
    const owner = ((process.env.IBKR_FLEX_OWNER || "SMSF").toUpperCase() === "PERSONAL" ? "PERSONAL" : "SMSF") as OwnerType;
    try {
      const report = await fetchIbkrFlexReport();
      const result = await storage.importIbkr(report, owner);
      output.ibkr = result;
      await storage.recordSyncRun({
        source: "IBKR",
        ownerType: owner,
        trigger: "scheduled",
        status: "success",
        startedAt,
        recordCount: report.transactions.length,
        positionCount: result.positions,
        cashAud: result.cashAud ?? null,
        message: `${result.positions} positions from Flex statement ending ${report.toDate}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";
      errors.push(`IBKR: ${message}`);
      await storage.recordSyncRun({
        source: "IBKR",
        ownerType: owner,
        trigger: "scheduled",
        status: "failed",
        startedAt,
        error: message,
      }).catch(() => {});
    }
  } else {
    await storage.recordSyncRun({
      source: "IBKR",
      ownerType: ((process.env.IBKR_FLEX_OWNER || "SMSF").toUpperCase() === "PERSONAL" ? "PERSONAL" : "SMSF") as OwnerType,
      trigger: "scheduled",
      status: "skipped",
      startedAt: new Date().toISOString(),
      message: "IBKR_FLEX_TOKEN or IBKR_FLEX_QUERY_ID is not configured.",
    }).catch(() => {});
  }

  try {
    const result = await syncDirectsharesEmail(storage, "scheduled");
    output.directsharesEmail = result;
    if (result.status === "failed" || result.status === "partial") {
      errors.push(`Directshares Email: ${result.errors.join("; ") || result.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Directshares email sync error";
    errors.push(`Directshares Email: ${message}`);
  }

  try {
    const result = await syncDirectsharesDividends(storage, "scheduled");
    output.directsharesDividends = result;
    if (result.status === "failed" || result.status === "partial") {
      errors.push(`Directshares Dividends: ${result.errors.join("; ") || result.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Directshares dividend sync error";
    errors.push(`Directshares Dividends: ${message}`);
  }

  try {
    const result = await syncMarketData(storage, "scheduled");
    output.marketData = result;
    if (result.status === "failed" || result.status === "partial") {
      errors.push(`Market Data: ${result.errors.join("; ") || result.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown market data sync error";
    errors.push(`Market Data: ${message}`);
  }

  const platinumStartedAt = new Date().toISOString();
  try {
    const price = await fetchAbcPlatinumPrice();
    output.platinum = await storage.recordPlatinumPrice(price);
    await storage.recordSyncRun({
      source: "ABC Bullion",
      ownerType: null,
      trigger: "scheduled",
      status: "success",
      startedAt: platinumStartedAt,
      recordCount: 1,
      message: `Platinum buyback ${price.buybackAudPerKg.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} per kg`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown price error";
    const fallback = await storage.getLatestPlatinumPrice().catch(() => null);
    if (fallback) {
      output.platinum = fallback;
      await storage.recordSyncRun({
        source: "ABC Bullion",
        ownerType: null,
        trigger: "scheduled",
        status: "skipped",
        startedAt: platinumStartedAt,
        recordCount: 0,
        message: `Live ABC Bullion refresh failed (${message}); using saved platinum buyback ${fallback.buybackAudPerKg.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} per kg from ${fallback.priceDate}.`,
      }).catch(() => {});
    } else {
      errors.push(`ABC Bullion: ${message}`);
      await storage.recordSyncRun({
        source: "ABC Bullion",
        ownerType: null,
        trigger: "scheduled",
        status: "failed",
        startedAt: platinumStartedAt,
        error: message,
      }).catch(() => {});
    }
  }

  return Response.json({ ok: errors.length === 0, ...output, errors }, { status: errors.length ? 207 : 200 });
}
