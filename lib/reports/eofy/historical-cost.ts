import type { PriceBook, StoredTransaction } from "@/lib/storage";
import { orderParcelsForDisposal, parcelSelectionLabels, methodForHolding, defaultParcelSelectionMethod, type ParcelSelection } from "@/lib/parcel-selection";
import { applyCorporateAction, dateDiffDays, discountRateForOwner, isDiscountEligible } from "@/lib/tax-lots";
import type { EofyHistoricalCostRow } from "./types";
import { historicalValuation } from "./valuation";
import { transactionAud, transactionFeesAud, transactionGrossAud, transactionNetCashAud } from "./utils";

type HistoricalLot = {
  /** Named as the engine names it, so its corporate-action rescale applies to these parcels too. */
  remainingQuantity: number;
  costPerUnitAud: number;
  acquisitionDate: string | null;
};

type HistoricalAccumulator = {
  ownerType: StoredTransaction["ownerType"];
  broker: string;
  accountKey: string;
  symbol: string;
  exchange: string;
  instrumentKey: string;
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

/*
 * Keyed without the account, as the parcel engine is. The account on a row says which export
 * carried it, not which holding it belongs to: the same Directshares position arrives as
 * "DIRECTSHARES" from the All Trades Report and as "4317403" from the contract notes. Keying on it
 * split BOE into three schedule rows closing at 56,837 units between them, against a real holding
 * of none.
 */
function historyKey(input: Pick<StoredTransaction, "ownerType" | "broker" | "symbol" | "exchange">) {
  /*
   * Ticker and venue, exactly as the parcel engine keys parcels — and deliberately not the
   * instrument key, which is not written the same way on both sides: a Directshares position is
   * stored as "ASL:ASX" while an imported trade carries "Directshares:ASL:ASX". Keying on it
   * reproduced the split this pooling exists to avoid, one holding at a time.
   */
  return [
    input.ownerType,
    input.broker,
    `${input.symbol}:${input.exchange}`.toUpperCase(),
  ].join("|");
}

function buyCostAud(transaction: StoredTransaction) {
  return Math.abs(transactionGrossAud(transaction)) + transactionFeesAud(transaction);
}

function saleProceedsAud(transaction: StoredTransaction) {
  const netCash = Math.abs(transactionNetCashAud(transaction));
  if (netCash) return netCash;
  return Math.max(0, transactionGrossAud(transaction) - transactionFeesAud(transaction));
}

function historicalAccumulator(transaction: StoredTransaction): HistoricalAccumulator {
  return {
    ownerType: transaction.ownerType,
    broker: transaction.broker,
    accountKey: transaction.accountKey,
    symbol: transaction.symbol,
    exchange: transaction.exchange,
    instrumentKey: transaction.instrumentKey || `${transaction.symbol}:${transaction.exchange}`,
    market: transaction.exchange,
    code: transaction.symbol,
    name: transaction.description || transaction.symbol,
    allocationMethod: parcelSelectionLabels[defaultParcelSelectionMethod],
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
    quantity: total.quantity + lot.remainingQuantity,
    costAud: total.costAud + lot.remainingQuantity * lot.costPerUnitAud,
  }), { quantity: 0, costAud: 0 });
}

function statedActionRatio(transaction: StoredTransaction) {
  const before = Number(transaction.raw?.actionQuantityBefore);
  const after = Number(transaction.raw?.actionQuantityAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0 || after <= 0) return null;
  return { before, after };
}

function applyHistoricalTransaction(row: HistoricalAccumulator, transaction: StoredTransaction, method: ParcelSelection["method"]) {
  /*
   * A consolidation changes how many units a holding is made of and what each one cost, without
   * changing the total. Skipping it left this schedule reporting PDN at a tenth of its real unit
   * cost and BOE at an eighth, the same error the parcel engine carried until it was fixed.
   */
  if (transaction.type === "CORPORATE_ACTION") {
    applyCorporateAction(row.lots, transaction.quantity ?? 0, statedActionRatio(transaction));
    return 0;
  }

  const quantity = Math.abs(transaction.quantity ?? 0);
  if (!quantity) return 0;

  if (transaction.type === "BUY") {
    const costAud = buyCostAud(transaction);
    row.lots.push({ remainingQuantity: quantity, costPerUnitAud: quantity ? costAud / quantity : 0, acquisitionDate: transaction.tradeDate });
    return 0;
  }

  let remaining = quantity;
  let costOfSalesAud = 0;
  /*
   * Ordered by the same election the CGT used. A cost-of-sales figure that consumed a different
   * parcel from the disposal printed beside it is not a second opinion, it is a contradiction:
   * under a LIFO election this schedule reported $100 against the CGT's $200 for one sale.
   */
  const proceedsPerUnitAud = quantity ? saleProceedsAud(transaction) / quantity : 0;
  const ordered = orderParcelsForDisposal(row.lots, method, (lot) => {
    const gainPerUnitAud = proceedsPerUnitAud - lot.costPerUnitAud;
    if (gainPerUnitAud <= 0) return gainPerUnitAud;
    const eligible = isDiscountEligible(dateDiffDays(lot.acquisitionDate, transaction.tradeDate));
    return eligible ? gainPerUnitAud * (1 - discountRateForOwner(transaction.ownerType)) : gainPerUnitAud;
  });
  for (const lot of ordered) {
    if (remaining <= 0) break;
    if (lot.remainingQuantity <= 0) continue;
    const matchedQuantity = Math.min(lot.remainingQuantity, remaining);
    costOfSalesAud += matchedQuantity * lot.costPerUnitAud;
    lot.remainingQuantity -= matchedQuantity;
    remaining -= matchedQuantity;
  }

  if (remaining > 0) {
    const proceedsAud = saleProceedsAud(transaction) * (remaining / quantity);
    const realisedAud = transactionAud(transaction.realisedPnl, transaction) * (remaining / quantity);
    costOfSalesAud += Math.max(0, proceedsAud - realisedAud);
  }

  row.lots = row.lots.filter((lot) => lot.remainingQuantity > 0.000001);
  return costOfSalesAud;
}

function accumulate(transactions: StoredTransaction[], startDate: string, endDate: string, selection: ParcelSelection) {
  const rows = new Map<string, HistoricalAccumulator>();
  const sorted = [...transactions]
    .filter((transaction) => transaction.type === "BUY" || transaction.type === "SELL" || transaction.type === "CORPORATE_ACTION")
    .filter((transaction) => transaction.tradeDate <= endDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.externalId.localeCompare(b.externalId));

  for (const transaction of sorted) {
    const key = historyKey(transaction);
    const row = rows.get(key) ?? historicalAccumulator(transaction);
    const method = methodForHolding(selection, transaction);
    row.allocationMethod = parcelSelectionLabels[method];
    if (transaction.tradeDate < startDate) {
      applyHistoricalTransaction(row, transaction, method);
      const opening = lotTotals(row.lots);
      row.openingBalanceAud = opening.costAud;
      row.openingQuantity = opening.quantity;
      rows.set(key, row);
      continue;
    }

    if (transaction.type === "BUY") {
      row.purchasesAud += buyCostAud(transaction);
      applyHistoricalTransaction(row, transaction, method);
    } else {
      row.costOfSalesAud += applyHistoricalTransaction(row, transaction, method);
    }
    rows.set(key, row);
  }

  return rows;
}

/**
 * What was actually held at a cut-off, reconstructed from the trades rather than read off today.
 *
 * The year-end unrealised schedule took its quantities from current holdings, so a position sold
 * in August reported the year-end value of two units spread across the one unit still held, and a
 * holding sold out entirely vanished from a schedule that is supposed to show what was owned on
 * 30 June. A closing position is the one thing the transactions can state exactly.
 */
export function yearEndPositions(transactions: StoredTransaction[], endDate: string, selection: ParcelSelection = { method: defaultParcelSelectionMethod }) {
  return [...accumulate(transactions, endDate, endDate, selection).values()]
    .map((row) => ({ ...row, ...lotTotals(row.lots) }))
    .filter((row) => row.quantity > 0.000001);
}

export function historicalCostRows(transactions: StoredTransaction[], startDate: string, endDate: string, priceBook?: PriceBook, selection: ParcelSelection = { method: defaultParcelSelectionMethod }): EofyHistoricalCostRow[] {
  return [...accumulate(transactions, startDate, endDate, selection).values()]
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
