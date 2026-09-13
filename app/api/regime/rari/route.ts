import { NextResponse } from "next/server";
import { RARI_DEFAULT_DEFINITION, rariSnapshot } from "@/lib/regime/rari";
import { loadRariResults } from "@/lib/regime/rari-service";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("recompute") === "1";
    const results = await loadRariResults(getStorage(), { force });
    const snapshot = rariSnapshot(results, RARI_DEFAULT_DEFINITION);
    const current = snapshot.current;
    return NextResponse.json({
      score: current?.score ?? null,
      regime: current?.regimeId ?? null,
      regimeLabel: current?.regimeLabel ?? null,
      asOf: current?.asOfDate ?? current?.date ?? null,
      status: current?.status ?? "insufficient_data",
      changes: snapshot.changes,
      components: current?.components ?? [],
      lastCalculationTimestamp: current?.calculatedAt ?? null,
      messages: current?.inputs?.messages ?? [],
      definition: RARI_DEFAULT_DEFINITION,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load RARI." }, { status: 500 });
  }
}
