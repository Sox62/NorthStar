import {
  directsharesDividendEmailConfigFromEnv,
  fetchDirectsharesDividendEmailTransactions,
  hasDirectsharesDividendEmailConfig,
} from "../integrations/directshares-dividend-email";
import type { OwnerType, StorageAdapter, SyncStatus, SyncTrigger } from "../storage";

export type DirectsharesDividendSyncOutput = {
  synced: boolean;
  source: "Directshares Dividends";
  ownerType: OwnerType;
  configured: boolean;
  mailbox?: string;
  messages: number;
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

export function directsharesDividendOwnerFromEnv(env = process.env): OwnerType {
  return (env.DIRECTSHARES_DIVIDEND_EMAIL_OWNER || env.DIRECTSHARES_EMAIL_OWNER || "PERSONAL").toUpperCase() === "SMSF" ? "SMSF" : "PERSONAL";
}

export async function syncDirectsharesDividends(storage: StorageAdapter, trigger: SyncTrigger, ownerType = directsharesDividendOwnerFromEnv()): Promise<DirectsharesDividendSyncOutput> {
  const startedAt = new Date().toISOString();
  if (!hasDirectsharesDividendEmailConfig()) {
    const message = "Directshares dividend email sync is not configured.";
    await storage.recordSyncRun({
      source: "Directshares Dividends",
      ownerType,
      trigger,
      status: "skipped",
      startedAt,
      message,
    }).catch(() => {});
    return {
      synced: false,
      source: "Directshares Dividends",
      ownerType,
      configured: false,
      messages: 0,
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
    const fetched = await fetchDirectsharesDividendEmailTransactions(directsharesDividendEmailConfigFromEnv());
    const imported = fetched.transactions.length
      ? await storage.importDirectsharesTransactions(fetched.transactions, ownerType, "Dividend Statements")
      : null;
    const status: SyncStatus = fetched.errors.length ? (fetched.transactions.length ? "partial" : "failed") : "success";
    const message = fetched.transactions.length
      ? `${imported?.imported ?? 0} imported, ${imported?.duplicates ?? 0} duplicate dividend payment${fetched.transactions.length === 1 ? "" : "s"}.`
      : fetched.errors.length
        ? "Directshares dividend sync found emails, but none could be parsed."
        : "No Directshares dividend emails found.";

    await storage.recordSyncRun({
      source: "Directshares Dividends",
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
      source: "Directshares Dividends",
      ownerType,
      configured: true,
      mailbox: fetched.mailbox,
      messages: fetched.messages,
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
    const message = error instanceof Error ? error.message : "Unable to sync Directshares dividend email.";
    await storage.recordSyncRun({
      source: "Directshares Dividends",
      ownerType,
      trigger,
      status: "failed",
      startedAt,
      error: message,
    }).catch(() => {});
    throw error;
  }
}
