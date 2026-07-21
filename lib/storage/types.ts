import type { IbkrFlexReport, ImportedTransaction, OpeningPosition } from "@/lib/integrations/types";
import type { AllocationTarget } from "@/northstar/lib/allocation-drift";

export type { AllocationTarget };

export type OwnerType = "PERSONAL" | "SMSF";
export type Scope = "overall" | "personal" | "smsf";
export type SyncTrigger = "manual" | "scheduled" | "system";
export type SyncStatus = "success" | "partial" | "failed" | "skipped";
export type ValuationFreshnessStatus = "fresh" | "stale" | "missing" | "fallback";

export type SyncRun = {
  id: string;
  source: string;
  ownerType: OwnerType | null;
  trigger: SyncTrigger;
  status: SyncStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number | null;
  recordCount: number | null;
  positionCount: number | null;
  cashAud: number | null;
  message: string | null;
  error: string | null;
};

export type ValuationFreshness = {
  source: string;
  status: ValuationFreshnessStatus;
  asOf: string | null;
  ageDays: number | null;
  staleAfterDays: number | null;
  detail: string;
};

export type PeriodReturnKey = "daily" | "mtd" | "ytd" | "since_inception";
export type PeriodReturn = {
  key: PeriodReturnKey;
  label: string;
  valueAud: number | null;
  valuePercent: number | null;
  startValue: number | null;
  endValue: number | null;
  startDate: string | null;
  endDate: string | null;
  note: string;
};

export type XirrSummary = {
  valuePercent: number | null;
  startDate: string | null;
  endDate: string | null;
  cashFlowCount: number;
  fallbackPositionCount: number;
  terminalValue: number;
  note: string;
};

export type CurrencyExposure = {
  currency: string;
  amountAud: number;
  valuePercent: number;
  positionValueAud: number;
  cashValueAud: number;
  positionCount: number;
};

export type IncomeSummary = {
  periodStart: string;
  periodEnd: string;
  dividendCount: number;
  netCashAud: number;
  taxWithheldAud: number;
  frankingCreditsAud: number;
  grossIncomeAud: number;
  grossedUpYieldPercent: number | null;
  symbols: Array<{
    symbol: string;
    payments: number;
    netCashAud: number;
    taxWithheldAud: number;
    frankingCreditsAud: number;
    grossIncomeAud: number;
  }>;
  note: string;
};

export type NewSyncRun = {
  source: string;
  ownerType?: OwnerType | null;
  trigger: SyncTrigger;
  status: SyncStatus;
  startedAt: string;
  finishedAt?: string;
  recordCount?: number | null;
  positionCount?: number | null;
  cashAud?: number | null;
  message?: string | null;
  error?: string | null;
};

export type StoredPosition = {
  id: string;
  ownerType: OwnerType;
  broker: string;
  accountKey: string;
  instrumentKey: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  assetClass: string;
  quantity: number;
  lastPrice: number | null;
  averageCostAud: number;
  costAud: number;
  marketValueAud: number;
  dayGainAud: number;
  pnlAud: number;
  pnlPercent: number;
  valuationBasis: "market" | "cost_basis";
  asOfDate: string;
  source: string;
};

export type StoredTransaction = ImportedTransaction & {
  id: string;
  ownerType: OwnerType;
  broker: string;
  accountKey: string;
};

export type CashAccount = {
  id: string;
  ownerType: OwnerType;
  institution: string;
  name: string;
  currency: string;
  balance: number;
  balanceAud: number;
  fxRateToAud: number;
  asOfDate: string;
  updatedAt: string;
};

export type PriceableInstrument = {
  symbol: string;
  exchange: string;
  name: string;
  currency: string;
  assetClass: string;
  positionCount: number;
  quantity: number;
  marketValueAud: number;
  lastPrice: number | null;
  asOfDate: string | null;
};

export type DailyPriceInput = {
  symbol: string;
  exchange?: string;
  close: number;
  currency: string;
  priceDate: string;
  source: string;
  fxRateToAud?: number;
};

export type StoredDailyPrice = {
  id: string;
  instrumentId: string | null;
  symbol: string;
  exchange: string;
  name: string;
  currency: string;
  close: number;
  priceDate: string;
  source: string;
  retrievedAt: string;
};

export type FxRateInput = {
  currency: string;
  rateToAud: number;
  rateDate: string;
  source: string;
};

export type StoredFxRate = FxRateInput & {
  id: string;
  retrievedAt: string;
};

export type PriceBook = {
  instruments: PriceableInstrument[];
  prices: StoredDailyPrice[];
  fxRates: StoredFxRate[];
};

export type PriceImportResult = {
  imported: number;
  matchedInstruments: number;
  updatedPositions: number;
  updatedCashAccounts: number;
  fxRates: number;
  skipped: number;
  errors: string[];
  storageMode: "local-file" | "postgresql";
};

export type PlatinumPrice = {
  provider: "ABC Bullion";
  productKey: "abc-platinum-1kg-minted-tablet";
  productName: string;
  retailAudPerKg: number;
  buybackAudPerKg: number;
  spreadAudPerKg: number;
  spreadPercentOfRetail: number;
  sourceUrl: string;
  priceDate: string;
  retrievedAt: string;
};

export type ManualAsset = {
  id: string;
  ownerType: OwnerType;
  assetType: "PLATINUM";
  name: string;
  quantityKg: number;
  totalCostAud: number;
  costAudPerKg: number;
  buybackAudPerKg: number;
  retailAudPerKg: number;
  marketValueAud: number;
  pnlAud: number;
  pnlPercent: number;
  dealerSpreadAudPerKg: number;
  dealerSpreadPercent: number;
  priceProvider: string;
  priceSourceUrl: string;
  purchaseDate: string;
  asOfDate: string;
  priceRetrievedAt: string | null;
  updatedAt: string;
};

export type Snapshot = {
  id: string;
  ownerType: OwnerType;
  capturedAt: string;
  marketValue: number;
  cashValue: number;
  netContributions: number;
};

export type LocalStore = {
  version: 6;
  transactions: StoredTransaction[];
  positions: StoredPosition[];
  cashAccounts: CashAccount[];
  manualAssets: ManualAsset[];
  platinumPrices: PlatinumPrice[];
  dailyPrices: StoredDailyPrice[];
  fxRates: StoredFxRate[];
  snapshots: Snapshot[];
  syncRuns: SyncRun[];
  allocationTargets: AllocationTarget[];
  imports: Array<{
    id: string;
    source: string;
    ownerType: OwnerType;
    importedAt: string;
    recordCount: number;
    accountKey: string;
  }>;
};

export type DashboardHolding = StoredPosition & { weight: number };
export type DashboardData = {
  scope: Scope;
  storageMode: "local-file" | "postgresql";
  totalValue: number;
  investedValue: number;
  cashValue: number;
  dailyMovement: number;
  totalReturn: number;
  totalReturnPercent: number;
  holdings: DashboardHolding[];
  allocations: Array<{ name: string; value: number; amount: number }>;
  performance: Array<{ date: string; overall?: number; personal?: number; smsf?: number }>;
  periodReturns: PeriodReturn[];
  xirr: XirrSummary;
  income: IncomeSummary;
  allocationTargets: AllocationTarget[];
  currencyExposure: CurrencyExposure[];
  accounts: Array<{ name: string; detail: string; status: string; ownerType: OwnerType }>;
  syncRuns: SyncRun[];
  freshness: ValuationFreshness[];
  provisionalValue: number;
  currentValue: number;
  lastUpdated: string | null;
};

export type ImportResult = {
  source: string;
  ownerType: OwnerType;
  accountKey: string;
  imported: number;
  duplicates: number;
  positions: number;
  storageMode: "local-file" | "postgresql";
  openPositions?: number;
  cashAud?: number;
  valuationSource?: "open_positions" | "open_positions_with_trade_overlay" | "trade_cost_basis";
};

export interface StorageAdapter {
  importIbkr(report: IbkrFlexReport, ownerType: OwnerType): Promise<ImportResult>;
  importDirectshares(positions: OpeningPosition[], ownerType: OwnerType): Promise<ImportResult>;
  importDirectsharesTransactions(transactions: ImportedTransaction[], ownerType: OwnerType, importSource?: string): Promise<ImportResult>;
  listTransactions(ownerType?: OwnerType): Promise<StoredTransaction[]>;
  listCashAccounts(ownerType?: OwnerType): Promise<CashAccount[]>;
  upsertCashAccount(input: Omit<CashAccount, "id" | "updatedAt" | "balanceAud"> & { id?: string }): Promise<CashAccount>;
  listManualAssets(ownerType?: OwnerType): Promise<ManualAsset[]>;
  upsertManualAsset(input: Omit<ManualAsset, "id" | "updatedAt" | "marketValueAud" | "pnlAud" | "pnlPercent" | "costAudPerKg" | "dealerSpreadAudPerKg" | "dealerSpreadPercent"> & { id?: string }): Promise<ManualAsset>;
  deleteManualAsset(id: string, ownerType: OwnerType): Promise<void>;
  listPriceBook(limit?: number): Promise<PriceBook>;
  recordDailyPrices(prices: DailyPriceInput[], fxRates?: FxRateInput[]): Promise<PriceImportResult>;
  getLatestPlatinumPrice(): Promise<PlatinumPrice | null>;
  recordPlatinumPrice(price: PlatinumPrice): Promise<PlatinumPrice>;
  recordSyncRun(input: NewSyncRun): Promise<SyncRun>;
  listSyncRuns(limit?: number, ownerType?: OwnerType): Promise<SyncRun[]>;
  listAllocationTargets(): Promise<AllocationTarget[]>;
  upsertAllocationTargets(targets: Array<Omit<AllocationTarget, "updatedAt">>): Promise<AllocationTarget[]>;
  dashboard(scope: Scope): Promise<DashboardData>;
}
