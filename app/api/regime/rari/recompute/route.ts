import { NextResponse } from "next/server";
import { RARI_DEFAULT_DEFINITION, rariSnapshot } from "@/lib/regime/rari";
import { recomputeRari } from "@/lib/regime/rari-service";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const storage = getStorage();
    const result = await recomputeRari(storage);
    const rows = await storage.listCompositeIndexResults(RARI_DEFAULT_DEFINITION.id, {
      calculationVersion: RARI_DEFAULT_DEFINITION.calculationVersion,
      limit: 10000,
    });
    return NextResponse.json({
      ...result,
      current: rariSnapshot(rows, RARI_DEFAULT_DEFINITION).current,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to recompute RARI." }, { status: 500 });
  }
}
