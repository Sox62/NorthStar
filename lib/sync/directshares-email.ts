import {
  directsharesEmailConfigFromEnv,
  fetchDirectsharesEmailTransactions,
  hasDirectsharesEmailConfig,
} from "../integrations/directshares-email";
import type { OwnerType, StorageAdapter, SyncStatus, SyncTrigger } from "../storage";

export type DirectsharesEmailSyncOutput = {
  synced: boolean;
  source: "Directshares Email";
  ownerType: OwnerType;
  configured: boolean;
  mailbox?: string;
  messages: number;
  attachments: number;
  parsed: number;
  skipped: number;
  imported: number;
  duplicates: number;
  positions: number | null;
  storageMode?: "local-file" | "postgresql";
  errors: string[];
  status: SyncStatus;
  message: string;
};

export function directsharesEmailOwnerFromEnv(env = process.env): OwnerType {
  return (env.DIRECTSHARES_EMAIL_OWNER || "PERSONAL").toUpperCase() === "SMSF" ? "SMSF" : "PERSONAL";
}

export async function syncDirectsharesEmail(storage: StorageAdapter, trigger: SyncTrigger, ownerType = directsharesEmailOwnerFromEnv()): Promise<DirectsharesEmailSyncOutput> {
  const startedAt = new Date().toISOString();
  if (!hasDirectsharesEmailConfig()) {
    const message = "Directshares email sync is not configured.";
    await storage.recordSyncRun({
      source: "Directshares Email",
      ownerType,
      trigger,
      status: "skipped",
      startedAt,
      message,
    }).catch(() => {});
    return {
      synced: false,
      source: "Directshares Email",
      ownerType,
      configured: false,
      messages: 0,
      attachments: 0,
      parsed: 0,
      skipped: 0,
      imported: 0,
      duplicates: 0,
      positions: null,
      errors: [],
      status: "skipped",
      message,
    };
  }

  try {
    const fetched = await fetchDirectsharesEmailTransactions(directsharesEmailConfigFromEnv());
    const imported = fetched.transactions.length
      ? await storage.importDirectsharesTransactions(fetched.transactions, ownerType)
      : null;
    const status: SyncStatus = fetched.errors.length ? (fetched.transactions.length ? "partial" : "failed") : "success";
    const message = fetched.transactions.length
      ? `${imported?.imported ?? 0} imported, ${imported?.duplicates ?? 0} duplicate Directshares contract note${fetched.transactions.length === 1 ? "" : "s"}.`
      : fetched.errors.length
        ? "Directshares email sync found confirmations, but none could be parsed."
        : "No Directshares contract notes found.";

    await storage.recordSyncRun({
      source: "Directshares Email",
      ownerType,
      trigger,
      status,
      startedAt,
      recordCount: fetched.parsed,
      positionCount: imported?.positions ?? null,
      message,
      error: fetched.errors.length ? fetched.errors.join("; ").slice(0, 1000) : null,
    }).catch(() => {});

    return {
      synced: status !== "failed",
      source: "Directshares Email",
      ownerType,
      configured: true,
      mailbox: fetched.mailbox,
      messages: fetched.messages,
      attachments: fetched.attachments,
      parsed: fetched.parsed,
      skipped: fetched.skipped,
      imported: imported?.imported ?? 0,
      duplicates: imported?.duplicates ?? 0,
      positions: imported?.positions ?? null,
      storageMode: imported?.storageMode,
      errors: fetched.errors,
      status,
      message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync Directshares email.";
    await storage.recordSyncRun({
      source: "Directshares Email",
      ownerType,
      trigger,
      status: "failed",
      startedAt,
      error: message,
    }).catch(() => {});
    throw error;
  }
}
