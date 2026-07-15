import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchIbkrFlexReport } from "@/lib/integrations/ibkr";
import { getStorage, type OwnerType } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  const storage = getStorage();
  let owner: OwnerType = "SMSF";
  try {
    owner = z.enum(["PERSONAL", "SMSF"]).parse((new URL(request.url).searchParams.get("owner") || "SMSF").toUpperCase());
    const report = await fetchIbkrFlexReport();
    const result = await storage.importIbkr(report, owner);
    await storage.recordSyncRun({
      source: "IBKR",
      ownerType: owner,
      trigger: "manual",
      status: "success",
      startedAt,
      recordCount: report.transactions.length,
      positionCount: result.positions,
      cashAud: result.cashAud ?? null,
      message: `${result.positions} positions from Flex statement ending ${report.toDate}`,
    });
    return NextResponse.json({
      synced: true,
      statementTo: report.toDate,
      generatedAt: report.whenGenerated ?? null,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync IBKR";
    await storage.recordSyncRun({
      source: "IBKR",
      ownerType: owner,
      trigger: "manual",
      status: "failed",
      startedAt,
      error: message,
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
