import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";
import { syncSourcedFundamentals } from "@/lib/sync/fundamentals";

export const runtime = "nodejs";

export async function POST() {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(sessionCookie).catch(() => null);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const storage = getStorage();
    const result = await syncSourcedFundamentals(storage, "manual");
    const fundamentals = await storage.listMinerFundamentals(result.symbols);
    return NextResponse.json({
      imported: result.imported,
      symbols: result.symbols,
      fundamentals,
      message: result.message,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load starter fundamentals" },
      { status: 500 },
    );
  }
}
