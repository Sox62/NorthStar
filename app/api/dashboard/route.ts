import { NextResponse } from "next/server";
import { getStorage, type Scope } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const requested = new URL(request.url).searchParams.get("scope") || "overall";
    const scope: Scope = requested === "personal" || requested === "smsf" ? requested : "overall";
    return NextResponse.json(await getStorage().dashboard(scope));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load dashboard" }, { status: 500 });
  }
}
