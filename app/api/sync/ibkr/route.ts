import { NextResponse } from "next/server";
import { z } from "zod";
import { ibkrFlexConfigForOwner, ibkrFlexNotConfiguredMessage, syncIbkrFlexConfig } from "@/lib/sync/ibkr-flex";
import { getStorage, type OwnerType } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  const storage = getStorage();
  let owner: OwnerType = "SMSF";
  let syncStarted = false;
  try {
    owner = z.enum(["PERSONAL", "SMSF"]).parse((new URL(request.url).searchParams.get("owner") || "SMSF").toUpperCase());
    const config = ibkrFlexConfigForOwner(owner);
    if (!config) throw new Error(ibkrFlexNotConfiguredMessage(owner));
    syncStarted = true;
    const result = await syncIbkrFlexConfig(storage, config, "manual");
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync IBKR";
    if (!syncStarted) {
      await storage.recordSyncRun({
        source: "IBKR",
        ownerType: owner,
        trigger: "manual",
        status: "failed",
        startedAt,
        error: message,
      }).catch(() => {});
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
