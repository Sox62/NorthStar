export type TransactionType = "BUY" | "SELL" | "DIVIDEND" | "DEPOSIT" | "WITHDRAWAL" | "FEE" | "FX";

export type ImportedTransaction = {
  externalId: string;
  externalAccountId?: string;
  tradeDate: string;
  settleDate?: string;
  symbol: string;
  exchange: string;
  description?: string;
  instrumentKey?: string;
  isin?: string;
  conid?: string;
  assetCategory?: string;
  subCategory?: string;
  type: TransactionType;
  quantity?: number;
  price?: number;
  closePrice?: number;
  cost?: number;
  currency: string;
  fees?: number;
  taxes?: number;
  netCash?: number;
  fxRateToBase?: number;
  realisedPnl?: number;
  source: string;
  raw?: Record<string, unknown>;
};

export type IbkrOpenPosition = {
  externalAccountId: string;
  instrumentKey: string;
  symbol: string;
  description: string;
  exchange: string;
  currency: string;
  quantity: number;
  lastPrice: number;
  fxRateToBase: number;
  averageCostAud: number;
  costAud: number;
  marketValueAud: number;
  pnlAud: number;
  pnlPercent: number;
  asOfDate: string;
  conid?: string;
  isin?: string;
  assetCategory?: string;
  subCategory?: string;
  raw?: Record<string, unknown>;
};

export type IbkrCashSnapshot = {
  externalAccountId: string;
  currency: string;
  balance: number;
  balanceAud: number;
  settledBalance: number;
  settledBalanceAud: number;
  fxRateToAud: number;
  asOfDate: string;
  raw?: Record<string, unknown>;
};

export type IbkrFlexOpenOrder = {
  externalAccountId: string;
  orderId: string;
  conid?: string;
  symbol: string;
  description: string;
  exchange: string;
  currency: string;
  side: string;
  status: string;
  orderType: string;
  timeInForce: string;
  totalQuantity: number | null;
  filledQuantity: number | null;
  remainingQuantity: number | null;
  limitPrice: number | null;
  stopPrice: number | null;
  averagePrice: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  raw?: Record<string, unknown>;
};

export type IbkrFlexReport = {
  accountId: string;
  fromDate: string;
  toDate: string;
  whenGenerated?: string;
  transactions: ImportedTransaction[];
  openPositions: IbkrOpenPosition[];
  openOrders: IbkrFlexOpenOrder[];
  cash: IbkrCashSnapshot | null;
  cashBalances: IbkrCashSnapshot[];
};

export type OpeningPosition = {
  externalAccountId?: string;
  accountName?: string;
  symbol: string;
  name?: string;
  exchange: string;
  currency: string;
  quantity: number;
  lastPrice: number;
  fxRate?: number;
  averageCostAud: number;
  costAud: number;
  marketValueAud: number;
  dayGainAud: number;
  pnlAud: number;
  pnlPercent: number;
};

export interface BrokerAdapter {
  name: string;
  importTransactions(from: string, to: string): Promise<ImportedTransaction[]>;
}

export interface MarketDataAdapter {
  getDailyClose(symbol: string, exchange: string, date: string): Promise<{ close: number; currency: string; source: string } | null>;
}
