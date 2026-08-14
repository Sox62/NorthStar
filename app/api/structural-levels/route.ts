import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const structuralLevelSchema = z.object({
  id: z.string().uuid().optional(),
  symbol: z.string().trim().min(1).max(32),
  comparisonSymbol: z.string().trim().min(1).max(32),
  label: z.string().trim().min(1).max(120),
  timeframe: z.enum(["daily", "weekly", "monthly", "secular"]),
  direction: z.enum(["support", "resistance"]),
  level: z.coerce.number().positive(),
  status: z.enum(["watching", "broken", "retest_held", "failed", "invalidated"]),
  source: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

function symbolsFromUrl(request: Request) {
  return new URL(request.url).searchParams.get("symbols")
    ?.split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

export async function GET(request: Request) {
  try {
    return NextResponse.json({ levels: await getStorage().listStructuralLevels(symbolsFromUrl(request)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load structural levels" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = structuralLevelSchema.parse(await request.json());
    return NextResponse.json({ level: await getStorage().upsertStructuralLevel({
      ...input,
      symbol: input.symbol.toUpperCase(),
      comparisonSymbol: input.comparisonSymbol.toUpperCase(),
      source: input.source || null,
      notes: input.notes || null,
      asOfDate: input.asOfDate || null,
    }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid structural level" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get("id"));
    await getStorage().deleteStructuralLevel(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete structural level" }, { status: 400 });
  }
}
