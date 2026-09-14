import { NextResponse } from "next/server";
import { getStorage, type Scope } from "@/lib/storage";

export const runtime = "nodejs";

function scopeFromUrl(request: Request): Scope {
  const value = new URL(request.url).searchParams.get("scope");
  return value === "personal" || value === "smsf" ? value : "overall";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 120));
    return NextResponse.json({ history: await getStorage().listRiskSnapshots(scopeFromUrl(request), limit) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load risk history." }, { status: 500 });
  }
}
