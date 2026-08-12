import type { IbkrFlexReport, IbkrOpenPosition, ImportedTransaction } from "@/lib/integrations/types";
import { classifyAsset } from "./classify";

const tolerance = 0.00000001;

export type ResolvedIbkrPosition = IbkrOpenPosition & {
  source: "IBKR Open Positions" | "IBKR Open Positions + Trades" | "IBKR Flex Trades";
  valuationBasis: "market" | "cost_basis";
};

function latestDate(values: string[]) {
  return values.filter(Boolean).sort().at(-1) ?? "";
}

function instrumentKey(transaction: ImportedTransaction) {
  return transaction.instrumentKey || `${transaction.symbol}:${transaction.exchange}`;
}

function asAud(value: number | null | undefined, fxRateToBase: number | null | undefined) {
  return (value ?? 0) * (fxRateToBase || 1);
}

function tradeQuantityDelta(transaction: ImportedTransaction) {
  if (transaction.type !== "BUY" && transaction.type !== "SELL") return 0;
  const quantity = Math.abs(transaction.quantity ?? 0);
  if (quantity <= tolerance) return 0;
  return transaction.type === "SELL" ? -quantity : quantity;
}

function hasReliableAudCost(transaction: ImportedTransaction) {
  return transaction.currency.toUpperCase() === "AUD" || transaction.fxRateToBase != null;
}

function tradeCostAud(transaction: ImportedTransaction) {
  const grossCost = transaction.cost != null
    ? Math.abs(asAud(transaction.cost, transaction.fxRateToBase))
    : Math.abs((transaction.quantity ?? 0) * (transaction.price ?? 0) * (transaction.fxRateToBase || 1));
  return grossCost + asAud(transaction.fees, transaction.fxRateToBase) + asAud(transaction.taxes, transaction.fxRateToBase);
}

function tradeValueAud(transaction: ImportedTransaction, quantity: number, fallbackCostAud: number) {
  const price = transaction.closePrice ?? transaction.price;
  if (!price) return fallbackCostAud;
  return Math.abs(quantity * price * (transaction.fxRateToBase || 1));
}

type CostLot = {
  quantity: number;
  costAud: number;
  reliable: boolean;
};

type TransactionCostBasis = {
  quantity: number;
  costAud: number;
  reliable: boolean;
};

function transactionCostBasis(transactions: ImportedTransaction[], snapshotDate: string) {
  const lotsByInstrument = new Map<string, CostLot[]>();
  for (const transaction of transactions) {
    if (snapshotDate && transaction.tradeDate > snapshotDate) continue;
    const key = instrumentKey(transaction);
    const delta = tradeQuantityDelta(transaction);
    if (Math.abs(delta) <= tolerance) continue;
    const lots = lotsByInstrument.get(key) ?? [];
    if (delta > 0) {
      lots.push({ quantity: delta, costAud: tradeCostAud(transaction), reliable: hasReliableAudCost(transaction) });
      lotsByInstrument.set(key, lots);
      continue;
    }

    let remainingSale = Math.abs(delta);
    while (remainingSale > tolerance && lots.length) {
      const lot = lots[0];
      const consumed = Math.min(lot.quantity, remainingSale);
      const ratio = lot.quantity ? consumed / lot.quantity : 0;
      lot.quantity -= consumed;
      lot.costAud -= lot.costAud * ratio;
      remainingSale -= consumed;
      if (lot.quantity <= tolerance) lots.shift();
    }
    lotsByInstrument.set(key, lots);
  }

  const basisByInstrument = new Map<string, TransactionCostBasis>();
  for (const [key, lots] of lotsByInstrument.entries()) {
    const quantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const costAud = lots.reduce((sum, lot) => sum + lot.costAud, 0);
    const reliable = lots.every((lot) => lot.reliable);
    if (quantity > tolerance) basisByInstrument.set(key, { quantity, costAud, reliable });
  }
  return basisByInstrument;
}

function applyTransactionCostBasis(position: ResolvedIbkrPosition, basis: TransactionCostBasis | undefined) {
  if (!basis || !basis.reliable || Math.abs(basis.quantity - position.quantity) > tolerance) return;
  position.costAud = basis.costAud;
  position.averageCostAud = position.quantity ? basis.costAud / position.quantity : 0;
  position.pnlAud = position.marketValueAud - position.costAud;
  position.pnlPercent = position.costAud ? position.pnlAud / position.costAud * 100 : 0;
}

function positionFromTrade(transaction: ImportedTransaction, delta: number): ResolvedIbkrPosition | null {
  if (delta <= tolerance) return null;
  const costAud = tradeCostAud(transaction);
  const marketValueAud = tradeValueAud(transaction, delta, costAud);
  return {
    externalAccountId: transaction.externalAccountId || "",
    instrumentKey: instrumentKey(transaction),
    symbol: transaction.symbol,
    description: transaction.description || transaction.symbol,
    exchange: transaction.exchange,
    currency: transaction.currency,
    quantity: delta,
    lastPrice: transaction.closePrice ?? transaction.price ?? 0,
    fxRateToBase: transaction.fxRateToBase ?? 1,
    averageCostAud: delta ? costAud / delta : 0,
    costAud,
    marketValueAud,
    pnlAud: marketValueAud - costAud,
    pnlPercent: costAud ? (marketValueAud - costAud) / costAud * 100 : 0,
    asOfDate: transaction.tradeDate,
    conid: transaction.conid,
    isin: transaction.isin,
    assetCategory: transaction.assetCategory || classifyAsset(transaction.symbol, transaction.description || ""),
    subCategory: transaction.subCategory,
    raw: transaction.raw,
    source: "IBKR Flex Trades",
    valuationBasis: "cost_basis",
  };
}

function applyBuy(position: ResolvedIbkrPosition, transaction: ImportedTransaction, delta: number) {
  const costAud = tradeCostAud(transaction);
  const marketValueAud = tradeValueAud(transaction, delta, costAud);
  position.quantity += delta;
  position.costAud += costAud;
  position.marketValueAud += marketValueAud;
  position.averageCostAud = position.quantity ? position.costAud / position.quantity : 0;
  position.pnlAud += marketValueAud - costAud;
  position.pnlPercent = position.costAud ? position.pnlAud / position.costAud * 100 : 0;
  position.lastPrice = transaction.closePrice ?? transaction.price ?? position.lastPrice;
  position.asOfDate = latestDate([position.asOfDate, transaction.tradeDate]);
  position.source = "IBKR Open Positions + Trades";
}

function applySell(position: ResolvedIbkrPosition, transaction: ImportedTransaction, delta: number) {
  const soldQuantity = Math.abs(delta);
  if (soldQuantity <= tolerance || position.quantity <= tolerance) return;
  const remainingQuantity = position.quantity - soldQuantity;
  if (remainingQuantity <= tolerance) {
    position.quantity = 0;
    position.costAud = 0;
    position.marketValueAud = 0;
    position.averageCostAud = 0;
    position.pnlAud = 0;
    position.pnlPercent = 0;
  } else {
    const ratio = remainingQuantity / position.quantity;
    position.quantity = remainingQuantity;
    position.costAud *= ratio;
    position.marketValueAud *= ratio;
    position.pnlAud *= ratio;
    position.averageCostAud = position.quantity ? position.costAud / position.quantity : 0;
    position.pnlPercent = position.costAud ? position.pnlAud / position.costAud * 100 : 0;
  }
  position.lastPrice = transaction.closePrice ?? transaction.price ?? position.lastPrice;
  position.asOfDate = latestDate([position.asOfDate, transaction.tradeDate]);
  position.source = "IBKR Open Positions + Trades";
}

function applyTrade(position: ResolvedIbkrPosition, transaction: ImportedTransaction, delta: number) {
  if (delta > 0) applyBuy(position, transaction, delta);
  else applySell(position, transaction, delta);
}

function resolvedOpenPosition(position: IbkrOpenPosition): ResolvedIbkrPosition {
  return {
    ...position,
    source: "IBKR Open Positions",
    valuationBasis: "market",
  };
}

export function resolveIbkrCurrentPositions(report: IbkrFlexReport): ResolvedIbkrPosition[] {
  const positions = new Map<string, ResolvedIbkrPosition>();
  const openKeys = new Set<string>();
  for (const position of report.openPositions) {
    const resolved = resolvedOpenPosition(position);
    positions.set(position.instrumentKey, resolved);
    openKeys.add(position.instrumentKey);
  }

  const openSnapshotDate = latestDate(report.openPositions.map((position) => position.asOfDate));
  const hasOpenSnapshot = report.openPositions.length > 0;

  const trades = [...report.transactions]
    .filter((transaction) => transaction.type === "BUY" || transaction.type === "SELL")
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.externalId.localeCompare(b.externalId));

  const basisByInstrument = hasOpenSnapshot ? transactionCostBasis(trades, openSnapshotDate) : new Map<string, TransactionCostBasis>();
  for (const position of positions.values()) applyTransactionCostBasis(position, basisByInstrument.get(position.instrumentKey));

  for (const transaction of trades) {
    const key = instrumentKey(transaction);
    const delta = tradeQuantityDelta(transaction);
    if (Math.abs(delta) <= tolerance) continue;

    if (hasOpenSnapshot) {
      const isAfterSnapshot = Boolean(openSnapshotDate && transaction.tradeDate > openSnapshotDate);
      const isMissingSameDayBuy = delta > 0 && !openKeys.has(key) && Boolean(openSnapshotDate && transaction.tradeDate >= openSnapshotDate);
      if (!isAfterSnapshot && !isMissingSameDayBuy) continue;
    }

    const existing = positions.get(key);
    if (existing) {
      applyTrade(existing, transaction, delta);
      if (Math.abs(existing.quantity) <= tolerance) positions.delete(key);
      continue;
    }

    const created = positionFromTrade(transaction, delta);
    if (created) positions.set(key, created);
  }

  return [...positions.values()].filter((position) => Math.abs(position.quantity) > tolerance);
}
