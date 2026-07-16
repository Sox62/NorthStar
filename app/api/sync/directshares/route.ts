import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage, type OwnerType } from "@/lib/storage";
import { directsharesEmailOwnerFromEnv, syncDirectsharesEmail } from "@/lib/sync/directshares-email";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const storage = getStorage();
  let owner: OwnerType = directsharesEmailOwnerFromEnv();
  try {
    const requestedOwner = new URL(request.url).searchParams.get("owner");
    if (requestedOwner) owner = z.enum(["PERSONAL", "SMSF"]).parse(requestedOwner.toUpperCase());
    const result = await syncDirectsharesEmail(storage, "manual", owner);
    return NextResponse.json(result, { status: result.status === "failed" ? 502 : result.status === "partial" ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sync Directshares email." }, { status: 502 });
  }
}
