import { NextResponse } from "next/server";
import { buildStopsRiskDashboard } from "@/lib/risk/stops";
import { getStorage, type Scope } from "@/lib/storage";

export const runtime = "nodejs";

function scopeFromUrl(request: Request): Scope {
  const value = new URL(request.url).searchParams.get("scope");
  return value === "personal" || value === "smsf" ? value : "overall";
}

export async function GET(request: Request) {
  try {
    const dashboard = await buildStopsRiskDashboard(getStorage(), scopeFromUrl(request));
    return NextResponse.json({ summary: dashboard.summary, sectors: dashboard.sectors, accounts: dashboard.accounts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load risk summary." }, { status: 500 });
  }
}
