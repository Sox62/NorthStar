import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage, type OwnerType } from "@/lib/storage";

export const runtime = "nodejs";

const cashSchema = z.object({
  id: z.string().optional(),
  ownerType: z.enum(["PERSONAL", "SMSF"]),
  institution: z.string().trim().min(1),
  name: z.string().trim().min(1),
  currency: z.string().trim().length(3),
  balance: z.coerce.number().finite(),
  fxRateToAud: z.coerce.number().positive(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("owner")?.toUpperCase();
    const owner = value === "PERSONAL" || value === "SMSF" ? value as OwnerType : undefined;
    return NextResponse.json({ accounts: await getStorage().listCashAccounts(owner) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load cash accounts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = cashSchema.parse(await request.json());
    return NextResponse.json({ account: await getStorage().upsertCashAccount(input) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid cash account" }, { status: 400 });
  }
}
