import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage, type Scope } from "@/lib/storage";
import { recordStopExit, setStopExitExcluded, stopExitsCsv, stoppedTradeHistory } from "@/lib/risk/stopped-trades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const value = url.searchParams.get("scope");
    const scope: Scope = value === "personal" || value === "smsf" ? value : "overall";
    const history = await stoppedTradeHistory(getStorage(), scope);
    if (url.searchParams.get("format") === "csv") return new Response(stopExitsCsv(history.records), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="SouthernStar_Stopped_Out_${scope}.csv"`, "Cache-Control": "no-store",
    } });
    return NextResponse.json(history, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load stopped-out trades." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try { return NextResponse.json({ record: await recordStopExit(getStorage(), await request.json()) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record the exit." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  try {
    const input = z.object({ id: z.string().min(1).max(100), excluded: z.boolean() }).parse(await request.json());
    return NextResponse.json({ record: await setStopExitExcluded(getStorage(), input.id, input.excluded) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the record." }, { status: 400 }); }
}
