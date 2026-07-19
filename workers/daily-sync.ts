import { fetchAbcPlatinumPrice } from "../lib/integrations/abc-bullion";
import { fetchIbkrFlexReport } from "../lib/integrations/ibkr";
import { getStorage, type OwnerType } from "../lib/storage";
import { syncDirectsharesDividends } from "../lib/sync/directshares-dividends";
import { syncDirectsharesEmail } from "../lib/sync/directshares-email";
import { syncMarketData } from "../lib/sync/market-data";

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const storage = getStorage();
  console.log(`[sync] ${today} starting`);

  if (process.env.IBKR_FLEX_TOKEN && process.env.IBKR_FLEX_QUERY_ID) {
    const owner = ((process.env.IBKR_FLEX_OWNER || "SMSF").toUpperCase() === "PERSONAL" ? "PERSONAL" : "SMSF") as OwnerType;
    try {
      const report = await fetchIbkrFlexReport();
      const result = await storage.importIbkr(report, owner);
      console.log(`[sync] IBKR: ${result.imported} new trades, ${result.positions} positions, cash ${result.cashAud ?? 0}`);
    } catch (error) {
      console.error("[sync] IBKR:", error);
    }
  } else {
    console.log("[sync] IBKR skipped: token or query ID missing");
  }

  try {
    const result = await syncDirectsharesEmail(storage, "scheduled");
    console.log(`[sync] Directshares email: ${result.status} · ${result.imported} imported, ${result.duplicates} duplicates`);
  } catch (error) {
    console.error("[sync] Directshares email:", error);
  }

  try {
    const result = await syncDirectsharesDividends(storage, "scheduled");
    console.log(`[sync] Directshares dividends: ${result.status} · ${result.imported} imported, ${result.duplicates} duplicates`);
  } catch (error) {
    console.error("[sync] Directshares dividends:", error);
  }

  try {
    const result = await syncMarketData(storage, "scheduled");
    console.log(`[sync] Market data: ${result.status} · ${result.updatedPositions} positions, ${result.quotes} quotes`);
  } catch (error) {
    console.error("[sync] Market data:", error);
  }

  try {
    const price = await fetchAbcPlatinumPrice();
    await storage.recordPlatinumPrice(price);
    console.log(`[sync] ABC Bullion platinum buyback: AUD ${price.buybackAudPerKg.toFixed(2)} per kg`);
  } catch (error) {
    const fallback = await storage.getLatestPlatinumPrice().catch(() => null);
    if (fallback) {
      const message = error instanceof Error ? error.message : "Unknown price error";
      await storage.recordSyncRun({
        source: "ABC Bullion",
        ownerType: null,
        trigger: "scheduled",
        status: "skipped",
        startedAt: new Date().toISOString(),
        recordCount: 0,
        message: `Live ABC Bullion refresh failed (${message}); using saved platinum buyback AUD ${fallback.buybackAudPerKg.toFixed(2)} per kg from ${fallback.priceDate}.`,
      }).catch(() => {});
      console.log(`[sync] ABC Bullion skipped: using saved platinum buyback AUD ${fallback.buybackAudPerKg.toFixed(2)} per kg from ${fallback.priceDate}`);
    } else {
      console.error("[sync] ABC Bullion:", error);
    }
  }
}

main().catch(error => { console.error(error); process.exit(1); });
