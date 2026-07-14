import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage, type OwnerType } from "@/lib/storage";

export const runtime = "nodejs";

const assetSchema = z.object({
  id: z.string().uuid().optional(),
  ownerType: z.enum(["PERSONAL", "SMSF"]),
  assetType: z.literal("PLATINUM").default("PLATINUM"),
  name: z.string().trim().min(1),
  quantityTroyOz: z.coerce.number().positive(),
  totalCostAud: z.coerce.number().nonnegative(),
  currentPriceAudPerOz: z.coerce.number().positive(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("owner")?.toUpperCase();
    const owner = value === "PERSONAL" || value === "SMSF" ? value as OwnerType : undefined;
    return NextResponse.json({ assets: await getStorage().listManualAssets(owner) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load physical assets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = assetSchema.parse(await request.json());
    return NextResponse.json({ asset: await getStorage().upsertManualAsset(input) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid physical asset" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = z.string().uuid().parse(url.searchParams.get("id"));
    const owner = z.enum(["PERSONAL", "SMSF"]).parse(url.searchParams.get("owner")?.toUpperCase());
    await getStorage().deleteManualAsset(id, owner);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete physical asset" }, { status: 400 });
  }
}
