import { NextResponse } from "next/server";
import { fetchAbcPlatinumPrice } from "@/lib/integrations/abc-bullion";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const startedAt = new Date().toISOString();
  try {
    const storage = getStorage();
    let price = await storage.getLatestPlatinumPrice();
    if (refresh || !price) {
      price = await fetchAbcPlatinumPrice();
      await storage.recordPlatinumPrice(price);
      await storage.recordSyncRun({
        source: "ABC Bullion",
        ownerType: null,
        trigger: refresh ? "manual" : "system",
        status: "success",
        startedAt,
        recordCount: 1,
        message: `Platinum buyback ${price.buybackAudPerKg.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} per kg`,
      });
    }
    return NextResponse.json({ price });
  } catch (error) {
    const fallback = await getStorage().getLatestPlatinumPrice().catch(() => null);
    await getStorage().recordSyncRun({
      source: "ABC Bullion",
      ownerType: null,
      trigger: refresh ? "manual" : "system",
      status: "failed",
      startedAt,
      error: error instanceof Error ? error.message : "Unable to refresh ABC Bullion platinum price",
    }).catch(() => {});
    return NextResponse.json({
      price: fallback,
      error: error instanceof Error ? error.message : "Unable to refresh ABC Bullion platinum price",
      usingSavedPrice: Boolean(fallback),
    }, { status: fallback ? 200 : 502 });
  }
}
