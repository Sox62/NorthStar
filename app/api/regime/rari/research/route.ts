import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateRari, compositeCalculationToStored, RARI_DEFAULT_DEFINITION, rariRange, rariSnapshot } from "@/lib/regime/rari";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  weights: z.record(z.string(), z.number().min(0).max(100)).optional(),
  thresholds: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    min: z.number().min(0).max(100),
    max: z.number().min(0).max(100),
  })).optional(),
  scoring: z.object({
    movingAverageDays: z.number().int().min(20).max(400).optional(),
    slopeLookbackDays: z.number().int().min(1).max(90).optional(),
    roc6mDays: z.number().int().min(60).max(260).optional(),
    roc12mDays: z.number().int().min(120).max(520).optional(),
  }).optional(),
  range: z.enum(["3M", "6M", "1Y", "3Y", "5Y", "10Y", "MAX"]).default("1Y"),
}).default({ range: "1Y" });

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json().catch(() => ({})));
    const definition = {
      ...RARI_DEFAULT_DEFINITION,
      id: "rari-research",
      calculationVersion: "research-preview",
      thresholds: input.thresholds ?? RARI_DEFAULT_DEFINITION.thresholds,
      components: RARI_DEFAULT_DEFINITION.components.map((component) => ({
        ...component,
        weight: input.weights?.[component.id] ?? component.weight,
        scoringConfig: input.scoring ? { ...component.scoringConfig, ...input.scoring } : component.scoringConfig,
      })),
    };
    const book = await getStorage().listPriceBook(20000);
    const rows = calculateRari(book, definition).map(compositeCalculationToStored);
    return NextResponse.json({
      definition,
      current: rariSnapshot(rows, definition).current,
      history: rariRange(rows, input.range),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to run RARI research preview." }, { status: 400 });
  }
}
