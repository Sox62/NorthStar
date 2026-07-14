import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchIbkrFlexReport } from "@/lib/integrations/ibkr";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const owner = z.enum(["PERSONAL", "SMSF"]).parse((new URL(request.url).searchParams.get("owner") || "SMSF").toUpperCase());
    const report = await fetchIbkrFlexReport();
    const result = await getStorage().importIbkr(report, owner);
    return NextResponse.json({
      synced: true,
      statementTo: report.toDate,
      generatedAt: report.whenGenerated ?? null,
      ...result,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sync IBKR" }, { status: 502 });
  }
}
