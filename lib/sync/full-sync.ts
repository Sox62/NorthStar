import { fetchAbcPlatinumPrice } from "@/lib/integrations/abc-bullion";
import type { QuoteProvider } from "@/lib/integrations/market-data";
import { getStorage, type SyncTrigger } from "@/lib/storage";
import { configuredIbkrFlexSyncs, ibkrFlexNotConfiguredMessage, legacyIbkrFlexOwner, syncIbkrFlexConfig } from "@/lib/sync/ibkr-flex";
import { syncDirectsharesDividends } from "@/lib/sync/directshares-dividends";
import { syncDirectsharesEmail } from "@/lib/sync/directshares-email";
import { syncMarketData } from "@/lib/sync/market-data";

export type FullSyncResult = {
  ok: boolean;
  syncedAt: string;
  task?: "market-data";
  errors: string[];
  ibkr?: unknown;
  ibkrAccounts?: string;
  directsharesEmail?: unknown;
  directsharesDividends?: unknown;
  marketData?: unknown;
  platinum?: unknown;
};

export async function runMarketDataOnlySync(trigger: SyncTrigger, provider: QuoteProvider = "auto"): Promise<FullSyncResult> {
  const storage = getStorage();
  const errors: string[] = [];
  const output: FullSyncResult = { ok: true, syncedAt: new Date().toISOString(), task: "market-data", errors };

  try {
    const result = await syncMarketData(storage, trigger, provider);
    output.marketData = result;
    if (result.status === "failed" || result.status === "partial") {
      errors.push(`Market Data: ${result.errors.join("; ") || result.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown market data sync error";
    errors.push(`Market Data: ${message}`);
  }

  output.ok = errors.length === 0;
  return output;
}

export async function runFullSync(trigger: SyncTrigger, provider: QuoteProvider = "auto"): Promise<FullSyncResult> {
  const storage = getStorage();
  const output: FullSyncResult = { ok: true, syncedAt: new Date().toISOString(), errors: [] };
  const errors = output.errors;
  const ibkrConfigs = configuredIbkrFlexSyncs();

  if (ibkrConfigs.length) {
    const ibkrResults = [];
    for (const config of ibkrConfigs) {
      try {
        const result = await syncIbkrFlexConfig(storage, config, trigger);
        ibkrResults.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown sync error";
        errors.push(`IBKR: ${message}`);
      }
    }
    output.ibkr = ibkrResults;
    output.ibkrAccounts = ibkrResults.length
      ? ibkrResults.map((result) => `${result.ownerType}: ${result.positions} positions, ${result.flexTrades} trades parsed${result.tradeConfirmTrades ? ` (${result.tradeConfirmTrades} from trade confirmations)` : ""} (${result.imported} imported, ${result.duplicates} duplicate), Flex ${result.statementFrom} to ${result.statementTo}, cash ${result.cashAud == null ? "not supplied" : result.cashAud.toLocaleString("en-AU", { style: "currency", currency: "AUD" })}`).join("; ")
      : "No IBKR accounts synced.";
  } else {
    await storage.recordSyncRun({
      source: "IBKR",
      ownerType: legacyIbkrFlexOwner(),
      trigger,
      status: "skipped",
      startedAt: new Date().toISOString(),
      message: ibkrFlexNotConfiguredMessage(),
    }).catch(() => {});
  }

  try {
    const result = await syncDirectsharesEmail(storage, trigger);
    output.directsharesEmail = result;
    if (result.status === "failed" || result.status === "partial") {
      errors.push(`Directshares Email: ${result.errors.join("; ") || result.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Directshares email sync error";
    errors.push(`Directshares Email: ${message}`);
  }

  try {
    const result = await syncDirectsharesDividends(storage, trigger);
    output.directsharesDividends = result;
    if (result.status === "failed" || result.status === "partial") {
      errors.push(`Directshares Dividends: ${result.errors.join("; ") || result.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Directshares dividend email sync error";
    errors.push(`Directshares Dividends: ${message}`);
  }

  try {
    const result = await syncMarketData(storage, trigger, provider);
    output.marketData = result;
    if (result.status === "failed" || result.status === "partial") {
      errors.push(`Market Data: ${result.errors.join("; ") || result.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown market data sync error";
    errors.push(`Market Data: ${message}`);
  }

  const platinumStartedAt = new Date().toISOString();
  try {
    const price = await fetchAbcPlatinumPrice();
    output.platinum = await storage.recordPlatinumPrice(price);
    await storage.recordSyncRun({
      source: "ABC Bullion",
      ownerType: null,
      trigger,
      status: "success",
      startedAt: platinumStartedAt,
      recordCount: 1,
      message: `Platinum buyback ${price.buybackAudPerKg.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} per kg`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown price error";
    const fallback = await storage.getLatestPlatinumPrice().catch(() => null);
    if (fallback) {
      output.platinum = fallback;
      await storage.recordSyncRun({
        source: "ABC Bullion",
        ownerType: null,
        trigger,
        status: "skipped",
        startedAt: platinumStartedAt,
        recordCount: 0,
        message: `Live ABC Bullion refresh failed (${message}); using saved platinum buyback ${fallback.buybackAudPerKg.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} per kg from ${fallback.priceDate}.`,
      }).catch(() => {});
    } else {
      errors.push(`ABC Bullion: ${message}`);
      await storage.recordSyncRun({
        source: "ABC Bullion",
        ownerType: null,
        trigger,
        status: "failed",
        startedAt: platinumStartedAt,
        error: message,
      }).catch(() => {});
    }
  }

  output.ok = errors.length === 0;
  return output;
}
