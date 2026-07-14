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

export type OpeningPosition = {
  externalAccountId?: string;
  accountName?: string;
  symbol: string;
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
