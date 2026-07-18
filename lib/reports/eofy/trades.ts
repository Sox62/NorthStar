import type { DashboardHolding, StoredTransaction } from "@/lib/storage";
import { sectorForInstrument } from "@/northstar/lib/sector-map";
import type { EofyHoldingReference, EofyTradeMovement } from "./types";
import { dateInRange, transactionAud, transactionGrossAud, transactionNetCashAud } from "./utils";

export function tradeRows(transactions: StoredTransaction[], startDate: string, endDate: string) {
  return transactions
    .filter((transaction) => (transaction.type === "BUY" || transaction.type === "SELL") && dateInRange(transaction.tradeDate, startDate, endDate))
    .map((transaction): EofyTradeMovement => ({
      id: transaction.id,
      type: transaction.type as "BUY" | "SELL",
      symbol: transaction.symbol,
      exchange: transaction.exchange,
      name: transaction.description || transaction.symbol,
      broker: transaction.broker,
      tradeDate: transaction.tradeDate,
      settleDate: transaction.settleDate ?? null,
      quantity: Math.abs(transaction.quantity ?? 0),
      price: transaction.price ?? null,
      currency: transaction.currency,
      fxRateToAud: transaction.fxRateToBase ?? null,
      grossAud: transactionGrossAud(transaction),
      feesAud: transactionAud(transaction.fees, transaction),
      taxesAud: transactionAud(transaction.taxes, transaction),
      netCashAud: transactionNetCashAud(transaction),
      source: transaction.source,
    }))
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.symbol.localeCompare(b.symbol));
}

export function holdingReference(holding: DashboardHolding): EofyHoldingReference {
  return {
    id: holding.id,
    symbol: holding.symbol,
    name: holding.name,
    broker: holding.broker,
    sector: sectorForInstrument(holding),
    quantity: holding.quantity,
    currency: holding.currency,
    costAud: holding.costAud,
    marketValueAud: holding.marketValueAud,
    unrealisedAud: holding.marketValueAud - holding.costAud,
    asOfDate: holding.asOfDate,
    source: holding.source,
  };
}
