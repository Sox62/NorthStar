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
    const storage = getStorage();
    const fallback = await storage.getLatestPlatinumPrice().catch(() => null);
    const message = error instanceof Error ? error.message : "Unable to refresh ABC Bullion platinum price";
    await storage.recordSyncRun({
      source: "ABC Bullion",
      ownerType: null,
      trigger: refresh ? "manual" : "system",
      status: fallback ? "skipped" : "failed",
      startedAt,
      recordCount: fallback ? 0 : null,
      message: fallback
        ? `Live ABC Bullion refresh failed (${message}); using saved platinum buyback ${fallback.buybackAudPerKg.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} per kg from ${fallback.priceDate}.`
        : null,
      error: fallback ? null : message,
    }).catch(() => {});
    return NextResponse.json({
      price: fallback,
      error: message,
      usingSavedPrice: Boolean(fallback),
    }, { status: fallback ? 200 : 502 });
  }
}
