import { fetchAbcPlatinumPrice } from "../lib/integrations/abc-bullion";
import { fetchIbkrFlexReport } from "../lib/integrations/ibkr";
import { getStorage, type OwnerType } from "../lib/storage";
import { syncDirectsharesEmail } from "../lib/sync/directshares-email";

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
    const price = await fetchAbcPlatinumPrice();
    await storage.recordPlatinumPrice(price);
    console.log(`[sync] ABC Bullion platinum buyback: AUD ${price.buybackAudPerKg.toFixed(2)} per kg`);
  } catch (error) {
    console.error("[sync] ABC Bullion:", error);
  }
}

main().catch(error => { console.error(error); process.exit(1); });
