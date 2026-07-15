import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";
import { defaultTargetAllocation, normaliseAllocationTargets } from "@/northstar/lib/allocation-drift";

export const runtime = "nodejs";

const sectors = Object.keys(defaultTargetAllocation) as [keyof typeof defaultTargetAllocation, ...(keyof typeof defaultTargetAllocation)[]];

const targetSchema = z.object({
  sector: z.enum(sectors),
  targetPercent: z.coerce.number().min(0).max(100),
});

const targetsSchema = z.object({
  targets: z.array(targetSchema).min(1),
});

function validateTotal(targets: ReturnType<typeof normaliseAllocationTargets>) {
  const total = targets.reduce((sum, target) => sum + target.targetPercent, 0);
  if (Math.abs(total - 100) > 0.01) throw new Error(`Allocation targets must total 100%. Current total is ${total.toFixed(2)}%.`);
}

export async function GET() {
  try {
    return NextResponse.json({ targets: await getStorage().listAllocationTargets() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load allocation targets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = targetsSchema.parse(await request.json());
    const targets = normaliseAllocationTargets(input.targets.map((target) => ({ ...target, updatedAt: null })));
    validateTotal(targets);
    return NextResponse.json({ targets: await getStorage().upsertAllocationTargets(targets) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid allocation targets" }, { status: 400 });
  }
}
