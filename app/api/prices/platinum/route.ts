import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchAbcPlatinumPrice } from "@/lib/integrations/abc-bullion";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const manualPriceSchema = z.object({
  buybackAudPerKg: z.coerce.number().positive(),
  retailAudPerKg: z.coerce.number().positive().optional(),
  priceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function sydneyToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  try {
    const storage = getStorage();
    const input = manualPriceSchema.parse(await request.json());
    const latest = await storage.getLatestPlatinumPrice().catch(() => null);
    const retailAudPerKg = Math.max(input.retailAudPerKg ?? latest?.retailAudPerKg ?? input.buybackAudPerKg, input.buybackAudPerKg);
    const spreadAudPerKg = Math.max(0, retailAudPerKg - input.buybackAudPerKg);
    const price = await storage.recordPlatinumPrice({
      provider: "ABC Bullion",
      productKey: "abc-platinum-1kg-minted-tablet",
      productName: "1kg ABC Platinum Minted Tablet",
      retailAudPerKg,
      buybackAudPerKg: input.buybackAudPerKg,
      spreadAudPerKg,
      spreadPercentOfRetail: retailAudPerKg ? spreadAudPerKg / retailAudPerKg * 100 : 0,
      sourceUrl: "https://www.abcbullion.com/sell/platinum",
      priceDate: input.priceDate ?? sydneyToday(),
      retrievedAt: startedAt,
    });
    await storage.recordSyncRun({
      source: "ABC Bullion",
      ownerType: null,
      trigger: "manual",
      status: "success",
      startedAt,
      recordCount: 1,
      message: "Manual ABC platinum buyback " + price.buybackAudPerKg.toLocaleString("en-AU", { style: "currency", currency: "AUD" }) + " per kg",
    });
    return NextResponse.json({ price, manual: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid manual ABC Bullion price" }, { status: 400 });
  }
}
