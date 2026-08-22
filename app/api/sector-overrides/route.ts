import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";
import { SECTOR_COLORS } from "@/southernstar/types";

// The Sector union has no runtime list; SECTOR_COLORS is keyed by every sector, so it is the
// single source of truth for what a valid sector name is.
const sectorNames = Object.keys(SECTOR_COLORS) as [string, ...string[]];

export const runtime = "nodejs";

const bodySchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  sector: z.enum(sectorNames).nullable(),
});

async function requireSession() {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(cookie).catch(() => null);
}

export async function GET() {
  try {
    return NextResponse.json({ overrides: await getStorage().listSectorOverrides() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load sector overrides" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await requireSession())) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const input = bodySchema.parse(await request.json());
    const storage = getStorage();
    // A null sector clears the override and hands the symbol back to the classifier.
    if (input.sector === null) {
      await storage.clearSectorOverride(input.symbol);
      return NextResponse.json({ cleared: input.symbol.trim().toUpperCase() });
    }
    return NextResponse.json({ override: await storage.setSectorOverride(input.symbol, input.sector as Parameters<typeof storage.setSectorOverride>[1]) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid sector override" }, { status: 400 });
  }
}
