import { starterMinerFundamentals } from "@/lib/fundamentals/starter-records";
import type { StorageAdapter, SyncTrigger } from "@/lib/storage";

export type FundamentalsSyncResult = {
  status: "success" | "failed";
  imported: number;
  /** Every symbol the seed covers, written or not, so callers can read back the current records. */
  symbols: string[];
  /** Symbols left alone because a saved record already exists. */
  preserved: string[];
  message: string;
  error?: string;
};

export async function syncSourcedFundamentals(storage: StorageAdapter, trigger: SyncTrigger): Promise<FundamentalsSyncResult> {
  const startedAt = new Date().toISOString();
  try {
    const symbols = starterMinerFundamentals.map((record) => record.symbol);
    // These are static seed records, and the upsert replaces every column. Running on every
    // scheduled sync therefore used to overwrite hand-entered research each night, so anything
    // already saved is left alone — the seed only fills gaps.
    const saved = await storage.listMinerFundamentals(symbols);
    const alreadySaved = new Set(saved.map((record) => record.symbol.toUpperCase()));

    const seeded: string[] = [];
    const preserved: string[] = [];
    for (const record of starterMinerFundamentals) {
      if (alreadySaved.has(record.symbol.toUpperCase())) {
        preserved.push(record.symbol);
        continue;
      }
      await storage.upsertMinerFundamentals(record);
      seeded.push(record.symbol);
    }

    const message = [
      seeded.length ? `${seeded.length} sourced miner fundamentals seeded: ${seeded.join(", ")}.` : "No sourced miner fundamentals needed seeding.",
      preserved.length ? `Left saved research untouched: ${preserved.join(", ")}.` : "",
    ].filter(Boolean).join(" ");
    await storage.recordSyncRun({
      source: "Fundamentals",
      ownerType: null,
      trigger,
      status: "success",
      startedAt,
      recordCount: seeded.length,
      message,
    }).catch(() => {});
    return { status: "success", imported: seeded.length, symbols, preserved, message };
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
    return { status: "failed", imported: 0, symbols: [], preserved: [], message, error: message };
  }
}
