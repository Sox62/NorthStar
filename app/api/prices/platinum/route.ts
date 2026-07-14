import { NextResponse } from "next/server";
import { fetchAbcPlatinumPrice } from "@/lib/integrations/abc-bullion";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const storage = getStorage();
    let price = await storage.getLatestPlatinumPrice();
    if (refresh || !price) {
      price = await fetchAbcPlatinumPrice();
      await storage.recordPlatinumPrice(price);
    }
    return NextResponse.json({ price });
  } catch (error) {
    const fallback = await getStorage().getLatestPlatinumPrice().catch(() => null);
    return NextResponse.json({
      price: fallback,
      error: error instanceof Error ? error.message : "Unable to refresh ABC Bullion platinum price",
      usingSavedPrice: Boolean(fallback),
    }, { status: fallback ? 200 : 502 });
  }
}
