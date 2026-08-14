import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { starterMinerFundamentals } from "@/lib/fundamentals/starter-records";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST() {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(sessionCookie).catch(() => null);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const storage = getStorage();
    const fundamentals = [];
    for (const record of starterMinerFundamentals) {
      fundamentals.push(await storage.upsertMinerFundamentals(record));
    }
    return NextResponse.json({
      imported: fundamentals.length,
      symbols: fundamentals.map((record) => record.symbol),
      fundamentals,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load starter fundamentals" },
      { status: 500 },
    );
  }
}
