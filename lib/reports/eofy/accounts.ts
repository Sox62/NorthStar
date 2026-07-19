import type { EofyAccountSummary, EofyHoldingReference, EofyIncomePayment, EofyTradeMovement } from "./types";

type MutableAccountSummary = EofyAccountSummary;

function accountKey(broker: string, account: string) {
  return `${broker || "Unknown"}:${account || "Unknown"}`;
}

function emptySummary(broker: string, account: string): MutableAccountSummary {
  return {
    broker: broker || "Unknown",
    accountKey: account || "Unknown",
    tradeMovements: 0,
    buyTrades: 0,
    sellTrades: 0,
    incomePayments: 0,
    grossIncomeAud: 0,
    netIncomeAud: 0,
    buysAud: 0,
    sellsAud: 0,
    tradeFeesAud: 0,
    currentHoldings: 0,
    currentMarketValueAud: 0,
    currentCostBaseAud: 0,
  };
}

function getOrCreate(groups: Map<string, MutableAccountSummary>, broker: string, account: string) {
  const key = accountKey(broker, account);
  const existing = groups.get(key);
  if (existing) return existing;
  const next = emptySummary(broker, account);
  groups.set(key, next);
  return next;
}

export function accountSummaries(
  tradeMovements: EofyTradeMovement[],
  incomePayments: EofyIncomePayment[],
  currentHoldings: EofyHoldingReference[],
): EofyAccountSummary[] {
  const groups = new Map<string, MutableAccountSummary>();

  for (const row of tradeMovements) {
    const summary = getOrCreate(groups, row.broker, row.accountKey);
    summary.tradeMovements += 1;
    summary.tradeFeesAud += row.feesAud + row.taxesAud;
    if (row.type === "BUY") {
      summary.buyTrades += 1;
      summary.buysAud += row.grossAud + row.feesAud + row.taxesAud;
    } else {
      summary.sellTrades += 1;
      summary.sellsAud += Math.abs(row.netCashAud || row.grossAud);
    }
  }

  for (const row of incomePayments) {
    const summary = getOrCreate(groups, row.broker, row.accountKey);
    summary.incomePayments += 1;
    summary.grossIncomeAud += row.grossIncomeAud;
    summary.netIncomeAud += row.netIncomeAud;
  }

  for (const row of currentHoldings) {
    const summary = getOrCreate(groups, row.broker, row.accountKey);
    summary.currentHoldings += 1;
    summary.currentMarketValueAud += row.marketValueAud;
    summary.currentCostBaseAud += row.costAud;
  }

  return [...groups.values()].sort((a, b) => a.broker.localeCompare(b.broker) || a.accountKey.localeCompare(b.accountKey));
}
