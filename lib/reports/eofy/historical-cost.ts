import type { PriceBook, StoredTransaction } from "@/lib/storage";
import type { EofyHistoricalCostRow } from "./types";
import { historicalValuation } from "./valuation";
import { transactionAud, transactionGrossAud, transactionNetCashAud } from "./utils";

type HistoricalLot = {
  quantity: number;
  costPerUnitAud: number;
};

type HistoricalAccumulator = {
  market: string;
  code: string;
  name: string;
  allocationMethod: string;
  lots: HistoricalLot[];
  openingBalanceAud: number;
  openingQuantity: number;
  purchasesAud: number;
  costOfSalesAud: number;
  capitalAdjustmentsAud: number;
};

function historyKey(input: Pick<StoredTransaction, "ownerType" | "broker" | "accountKey" | "instrumentKey" | "symbol" | "exchange">) {
  return [
    input.ownerType,
    input.broker,
    input.accountKey,
    input.instrumentKey || `${input.symbol}:${input.exchange}`,
  ].join("|");
}

function buyCostAud(transaction: StoredTransaction) {
  return Math.abs(transactionGrossAud(transaction)) + Math.abs(transactionAud(transaction.fees, transaction)) + Math.abs(transactionAud(transaction.taxes, transaction));
}

function saleProceedsAud(transaction: StoredTransaction) {
  const netCash = Math.abs(transactionNetCashAud(transaction));
  if (netCash) return netCash;
  return Math.max(0, transactionGrossAud(transaction) - Math.abs(transactionAud(transaction.fees, transaction)) - Math.abs(transactionAud(transaction.taxes, transaction)));
}

function historicalAccumulator(transaction: StoredTransaction): HistoricalAccumulator {
  return {
    market: transaction.exchange,
    code: transaction.symbol,
    name: transaction.description || transaction.symbol,
    allocationMethod: "FIFO",
    lots: [],
    openingBalanceAud: 0,
    openingQuantity: 0,
    purchasesAud: 0,
    costOfSalesAud: 0,
    capitalAdjustmentsAud: 0,
  };
}

function lotTotals(lots: HistoricalLot[]) {
  return lots.reduce((total, lot) => ({
    quantity: total.quantity + lot.quantity,
    costAud: total.costAud + lot.quantity * lot.costPerUnitAud,
  }), { quantity: 0, costAud: 0 });
}

function applyHistoricalTransaction(row: HistoricalAccumulator, transaction: StoredTransaction) {
  const quantity = Math.abs(transaction.quantity ?? 0);
  if (!quantity) return 0;

  if (transaction.type === "BUY") {
    const costAud = buyCostAud(transaction);
    row.lots.push({ quantity, costPerUnitAud: quantity ? costAud / quantity : 0 });
    return 0;
  }

  let remaining = quantity;
  let costOfSalesAud = 0;
  for (const lot of row.lots) {
    if (remaining <= 0) break;
    if (lot.quantity <= 0) continue;
    const matchedQuantity = Math.min(lot.quantity, remaining);
    costOfSalesAud += matchedQuantity * lot.costPerUnitAud;
    lot.quantity -= matchedQuantity;
    remaining -= matchedQuantity;
  }

  if (remaining > 0) {
    const proceedsAud = saleProceedsAud(transaction) * (remaining / quantity);
    const realisedAud = transactionAud(transaction.realisedPnl, transaction) * (remaining / quantity);
    costOfSalesAud += Math.max(0, proceedsAud - realisedAud);
  }

  row.lots = row.lots.filter((lot) => lot.quantity > 0.000001);
  return costOfSalesAud;
}

export function historicalCostRows(transactions: StoredTransaction[], startDate: string, endDate: string, priceBook?: PriceBook): EofyHistoricalCostRow[] {
  const rows = new Map<string, HistoricalAccumulator>();
  const sorted = [...transactions]
    .filter((transaction) => transaction.type === "BUY" || transaction.type === "SELL")
    .filter((transaction) => transaction.tradeDate <= endDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.externalId.localeCompare(b.externalId));

  for (const transaction of sorted) {
    const key = historyKey(transaction);
    const row = rows.get(key) ?? historicalAccumulator(transaction);
    if (transaction.tradeDate < startDate) {
      applyHistoricalTransaction(row, transaction);
      const opening = lotTotals(row.lots);
      row.openingBalanceAud = opening.costAud;
      row.openingQuantity = opening.quantity;
      rows.set(key, row);
      continue;
    }

    if (transaction.type === "BUY") {
      row.purchasesAud += buyCostAud(transaction);
      applyHistoricalTransaction(row, transaction);
    } else {
      row.costOfSalesAud += applyHistoricalTransaction(row, transaction);
    }
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => {
      const closing = lotTotals(row.lots);
      const baseRow = {
        market: row.market,
        code: row.code,
        name: row.name,
        allocationMethod: row.allocationMethod,
        openingBalanceAud: row.openingBalanceAud,
        openingMarketValueAud: null,
        openingQuantity: row.openingQuantity,
        purchasesAud: row.purchasesAud,
        costOfSalesAud: row.costOfSalesAud,
        capitalAdjustmentsAud: row.capitalAdjustmentsAud,
        closingBalanceAud: closing.costAud,
        closingQuantity: closing.quantity,
      };
      return {
        ...baseRow,
        ...historicalValuation(baseRow, priceBook, endDate),
      };
    })
    .filter((row) => row.openingBalanceAud || row.purchasesAud || row.costOfSalesAud || row.closingBalanceAud || row.openingQuantity || row.closingQuantity)
    .sort((a, b) => a.market.localeCompare(b.market) || a.code.localeCompare(b.code));
}
