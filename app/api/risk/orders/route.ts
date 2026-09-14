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
    return NextResponse.json({ entryOrders: dashboard.entryOrders, brokerOrders: dashboard.brokerOrders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load order risk." }, { status: 500 });
  }
}
