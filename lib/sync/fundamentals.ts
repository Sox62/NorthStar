import { starterMinerFundamentals } from "@/lib/fundamentals/starter-records";
import type { StorageAdapter, SyncTrigger } from "@/lib/storage";

export type FundamentalsSyncResult = {
  status: "success" | "failed";
  imported: number;
  symbols: string[];
  message: string;
  error?: string;
};

export async function syncSourcedFundamentals(storage: StorageAdapter, trigger: SyncTrigger): Promise<FundamentalsSyncResult> {
  const startedAt = new Date().toISOString();
  try {
    const fundamentals = [];
    for (const record of starterMinerFundamentals) {
      fundamentals.push(await storage.upsertMinerFundamentals(record));
    }
    const symbols = fundamentals.map((record) => record.symbol);
    const message = `${symbols.length} sourced miner fundamentals refreshed: ${symbols.join(", ")}.`;
    await storage.recordSyncRun({
      source: "Fundamentals",
      ownerType: null,
      trigger,
      status: "success",
      startedAt,
      recordCount: symbols.length,
      message,
    }).catch(() => {});
    return { status: "success", imported: symbols.length, symbols, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fundamentals sync error";
    await storage.recordSyncRun({
      source: "Fundamentals",
      ownerType: null,
      trigger,
      status: "failed",
      startedAt,
      error: message,
    }).catch(() => {});
    return { status: "failed", imported: 0, symbols: [], message, error: message };
  }
}
