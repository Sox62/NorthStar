import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const nullableNumber = z.preprocess((value) => value === "" || value === undefined ? null : value, z.coerce.number().finite().nullable());
const nullableText = z.preprocess((value) => value === "" || value === undefined ? null : value, z.string().trim().min(1).nullable());
const nullableDate = z.preprocess((value) => value === "" || value === undefined ? null : value, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const nullableUrl = z.preprocess((value) => value === "" || value === undefined ? null : value, z.string().url().nullable());
const score = z.preprocess((value) => value === "" || value === undefined ? null : value, z.coerce.number().int().min(0).max(5).nullable());

const fundamentalsSchema = z.object({
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  name: nullableText,
  primaryMetal: nullableText,
  jurisdiction: nullableText,
  projectStage: nullableText,
  productionOz: nullableNumber,
  aiscUsdPerOz: nullableNumber,
  resourceMoz: nullableNumber,
  reserveMoz: nullableNumber,
  cashAud: nullableNumber,
  debtAud: nullableNumber,
  marketCapAud: nullableNumber,
  npvAud: nullableNumber,
  capexAud: nullableNumber,
  irrPercent: nullableNumber,
  jurisdictionScore: score,
  balanceSheetScore: score,
  dilutionScore: score,
  managementScore: score,
  notes: z.preprocess((value) => value === undefined ? null : value, z.string().trim().nullable()),
  sourceUrl: nullableUrl,
  asOfDate: nullableDate,
});

export async function GET(request: Request) {
  try {
    const symbols = new URL(request.url).searchParams.get("symbols")
      ?.split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);
    return NextResponse.json({ fundamentals: await getStorage().listMinerFundamentals(symbols) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load fundamentals" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = fundamentalsSchema.parse(await request.json());
    return NextResponse.json({ fundamental: await getStorage().upsertMinerFundamentals(input) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid fundamentals record" }, { status: 400 });
  }
}
