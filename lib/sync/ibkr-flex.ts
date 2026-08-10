import { fetchIbkrFlexReport } from "@/lib/integrations/ibkr";
import type { ImportResult, OwnerType, StorageAdapter, SyncTrigger } from "@/lib/storage";

export type IbkrFlexSyncConfig = {
  ownerType: OwnerType;
  token: string;
  queryId: string;
  label: string;
  source: "legacy" | "owner-specific";
};

export type IbkrFlexSyncResult = ImportResult & {
  synced: true;
  label: string;
  querySource: IbkrFlexSyncConfig["source"];
  statementTo: string;
  generatedAt: string | null;
};

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

function ownerFromEnv(value: string | undefined, fallback: OwnerType): OwnerType {
  return clean(value).toUpperCase() === "PERSONAL" ? "PERSONAL" : fallback;
}

export function legacyIbkrFlexOwner(): OwnerType {
  return ownerFromEnv(process.env.IBKR_FLEX_OWNER, "SMSF");
}

function pushConfig(configs: IbkrFlexSyncConfig[], config: IbkrFlexSyncConfig) {
  if (!config.token || !config.queryId) return;
  const duplicate = configs.some((item) =>
    item.ownerType === config.ownerType
    && item.token === config.token
    && item.queryId === config.queryId,
  );
  if (!duplicate) configs.push(config);
}

export function configuredIbkrFlexSyncs(): IbkrFlexSyncConfig[] {
  const configs: IbkrFlexSyncConfig[] = [];
  const sharedToken = clean(process.env.IBKR_FLEX_TOKEN);
  const legacyQueryId = clean(process.env.IBKR_FLEX_QUERY_ID);

  pushConfig(configs, {
    ownerType: "PERSONAL",
    token: clean(process.env.IBKR_PERSONAL_FLEX_TOKEN) || sharedToken,
    queryId: clean(process.env.IBKR_PERSONAL_FLEX_QUERY_ID),
    label: "Personal IBKR",
    source: "owner-specific",
  });

  pushConfig(configs, {
    ownerType: "SMSF",
    token: clean(process.env.IBKR_SMSF_FLEX_TOKEN) || sharedToken,
    queryId: clean(process.env.IBKR_SMSF_FLEX_QUERY_ID),
    label: "SMSF IBKR",
    source: "owner-specific",
  });

  const legacyOwner = legacyIbkrFlexOwner();
  if (!configs.some((config) => config.ownerType === legacyOwner)) {
    pushConfig(configs, {
      ownerType: legacyOwner,
      token: sharedToken,
      queryId: legacyQueryId,
      label: `${legacyOwner === "PERSONAL" ? "Personal" : "SMSF"} IBKR legacy`,
      source: "legacy",
    });
  }

  return configs;
}

export function ibkrFlexConfigForOwner(ownerType: OwnerType) {
  return configuredIbkrFlexSyncs().find((config) => config.ownerType === ownerType) ?? null;
}

export function ibkrFlexNotConfiguredMessage(ownerType?: OwnerType) {
  if (ownerType === "PERSONAL") {
    return "Personal IBKR Flex is not configured. Set IBKR_PERSONAL_FLEX_QUERY_ID plus IBKR_FLEX_TOKEN or IBKR_PERSONAL_FLEX_TOKEN.";
  }
  if (ownerType === "SMSF") {
    return "SMSF IBKR Flex is not configured. Set IBKR_SMSF_FLEX_QUERY_ID plus IBKR_FLEX_TOKEN or IBKR_SMSF_FLEX_TOKEN, or keep using IBKR_FLEX_QUERY_ID with IBKR_FLEX_OWNER=SMSF.";
  }
  return "No IBKR Flex queries are configured. Set IBKR_FLEX_TOKEN plus IBKR_FLEX_QUERY_ID, or owner-specific IBKR_PERSONAL_FLEX_QUERY_ID / IBKR_SMSF_FLEX_QUERY_ID.";
}

export async function syncIbkrFlexConfig(storage: StorageAdapter, config: IbkrFlexSyncConfig, trigger: SyncTrigger): Promise<IbkrFlexSyncResult> {
  const startedAt = new Date().toISOString();
  try {
    const report = await fetchIbkrFlexReport(config.token, config.queryId);
    const result = await storage.importIbkr(report, config.ownerType);
    await storage.recordSyncRun({
      source: "IBKR",
      ownerType: config.ownerType,
      trigger,
      status: "success",
      startedAt,
      recordCount: report.transactions.length,
      positionCount: result.positions,
      cashAud: result.cashAud ?? null,
      message: `${result.positions} ${config.label} positions from Flex statement ending ${report.toDate}; ${report.openOrders.length} open order${report.openOrders.length === 1 ? "" : "s"}; cash ${report.cashBalances.length ? report.cashBalances.map((cash) => `${cash.currency} ${cash.balance.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`).join(", ") : report.cash ? `AUD ${report.cash.balanceAud.toLocaleString("en-AU", { maximumFractionDigits: 2 })}` : "not supplied by Flex"}`,
    });
    return {
      synced: true,
      label: config.label,
      querySource: config.source,
      statementTo: report.toDate,
      generatedAt: report.whenGenerated ?? null,
      ...result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown IBKR sync error";
    await storage.recordSyncRun({
      source: "IBKR",
      ownerType: config.ownerType,
      trigger,
      status: "failed",
      startedAt,
      error: `${config.label}: ${message}`,
    }).catch(() => {});
    throw new Error(`${config.label}: ${message}`);
  }
}
