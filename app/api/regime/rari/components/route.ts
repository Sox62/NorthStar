import { NextResponse } from "next/server";
import { RARI_DEFAULT_DEFINITION, rariSnapshot } from "@/lib/regime/rari";
import { loadRariResults } from "@/lib/regime/rari-service";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const results = await loadRariResults(getStorage());
    const current = rariSnapshot(results, RARI_DEFAULT_DEFINITION).current;
    return NextResponse.json({
      definition: RARI_DEFAULT_DEFINITION,
      asOf: current?.asOfDate ?? current?.date ?? null,
      status: current?.status ?? "insufficient_data",
      components: current?.components ?? [],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load RARI components." }, { status: 500 });
  }
}
