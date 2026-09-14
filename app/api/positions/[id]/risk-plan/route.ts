import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const planSchema = z.object({
  stopType: z.enum(["STRUCTURAL", "TACTICAL", "TRAILING", "VOLATILITY", "MANUAL_REVIEW"]),
  plannedStopPrice: z.number().finite().positive().nullable().optional(),
  plannedTargetPrice: z.number().finite().positive().nullable().optional(),
  rationale: z.string().max(2000).nullable().optional(),
  invalidationNotes: z.string().max(2000).nullable().optional(),
  sectorBenchmarkSymbol: z.string().trim().max(24).nullable().optional(),
  reviewStatus: z.string().trim().max(80).nullable().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const plan = (await getStorage().listPositionRiskPlans()).find((item) => item.positionId === id);
    return NextResponse.json({ plan: plan ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load risk plan." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = planSchema.parse(await request.json());
    const plan = await getStorage().upsertPositionRiskPlan({
      positionId: id,
      stopType: input.stopType,
      plannedStopPrice: input.plannedStopPrice ?? null,
      plannedTargetPrice: input.plannedTargetPrice ?? null,
      rationale: input.rationale ?? null,
      invalidationNotes: input.invalidationNotes ?? null,
      sectorBenchmarkSymbol: input.sectorBenchmarkSymbol ?? null,
      reviewStatus: input.reviewStatus ?? null,
    });
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save risk plan." }, { status: 400 });
  }
}

export const POST = PUT;
