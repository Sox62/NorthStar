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
    const params = new URL(request.url).searchParams;
    const selectedOwner = (params.get("owner") || "SMSF").toUpperCase();
    if (selectedOwner !== "PERSONAL" && selectedOwner !== "SMSF") throw new Error("Choose Personal or SMSF for the IBKR sync.");
    owner = selectedOwner;
    const mode = params.get("mode") ?? "portfolio";
    if (mode !== "portfolio" && mode !== "evidence") throw new Error("Choose portfolio or evidence sync mode.");
    const config = ibkrFlexConfigForOwner(owner);
    if (!config) throw new Error(ibkrFlexNotConfiguredMessage(owner));
    syncStarted = true;
    const result = await syncIbkrFlexConfig(storage, config, "manual", { evidenceOnly: mode === "evidence" });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
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
    return Response.json({ error: message }, { status: 502 });
  }
}
