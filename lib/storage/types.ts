import type { IbkrFlexReport, ImportedTransaction, OpeningPosition } from "@/lib/integrations/types";

export type OwnerType = "PERSONAL" | "SMSF";
export type Scope = "overall" | "personal" | "smsf";

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

export type StoredTransaction = Omit<ImportedTransaction, "raw"> & {
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

export type ManualAsset = {
  id: string;
  ownerType: OwnerType;
  assetType: "PLATINUM";
  name: string;
  quantityTroyOz: number;
  totalCostAud: number;
  currentPriceAudPerOz: number;
  marketValueAud: number;
  pnlAud: number;
  pnlPercent: number;
  purchaseDate: string;
  asOfDate: string;
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
  version: 3;
  transactions: StoredTransaction[];
  positions: StoredPosition[];
  cashAccounts: CashAccount[];
  manualAssets: ManualAsset[];
  snapshots: Snapshot[];
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
  accounts: Array<{ name: string; detail: string; status: string; ownerType: OwnerType }>;
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
  valuationSource?: "open_positions" | "trade_cost_basis";
};

export interface StorageAdapter {
  importIbkr(report: IbkrFlexReport, ownerType: OwnerType): Promise<ImportResult>;
  importDirectshares(positions: OpeningPosition[], ownerType: OwnerType): Promise<ImportResult>;
  listCashAccounts(ownerType?: OwnerType): Promise<CashAccount[]>;
  upsertCashAccount(input: Omit<CashAccount, "id" | "updatedAt" | "balanceAud"> & { id?: string }): Promise<CashAccount>;
  listManualAssets(ownerType?: OwnerType): Promise<ManualAsset[]>;
  upsertManualAsset(input: Omit<ManualAsset, "id" | "updatedAt" | "marketValueAud" | "pnlAud" | "pnlPercent"> & { id?: string }): Promise<ManualAsset>;
  deleteManualAsset(id: string, ownerType: OwnerType): Promise<void>;
  dashboard(scope: Scope): Promise<DashboardData>;
}
