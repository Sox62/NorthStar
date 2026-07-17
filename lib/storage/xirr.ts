import type { CashAccount, OwnerType, Scope, StoredPosition, StoredTransaction, XirrSummary } from "./types";

type XirrFlow = {
  date: string;
  amount: number;
  source: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value: string | null | undefined) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function addFlow(flows: XirrFlow[], flow: XirrFlow) {
  if (!Number.isFinite(flow.amount) || Math.abs(flow.amount) < 0.005) return;
  flows.push({ ...flow, date: dateOnly(flow.date) });
}

function audAmount(value: number | null | undefined, fxRate: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return value * (fxRate || 1);
}

function transactionCashFlowAud(transaction: StoredTransaction) {
  const netCash = audAmount(transaction.netCash, transaction.fxRateToBase);
  const cost = audAmount(transaction.cost, transaction.fxRateToBase);
  const fees = audAmount(transaction.fees, transaction.fxRateToBase) ?? 0;
  const taxes = audAmount(transaction.taxes, transaction.fxRateToBase) ?? 0;

  switch (transaction.type) {
    case "BUY":
      return netCash ?? -(Math.abs(cost ?? 0) + fees + taxes);
    case "SELL":
      return netCash ?? Math.max(0, Math.abs(cost ?? 0) - fees - taxes);
    case "DIVIDEND":
      return netCash ?? Math.max(0, Math.abs(cost ?? 0) - fees - taxes);
    case "DEPOSIT":
      return -Math.abs(netCash ?? cost ?? 0);
    case "WITHDRAWAL":
      return Math.abs(netCash ?? cost ?? 0);
    case "FEE":
      return -Math.abs(netCash ?? cost ?? fees + taxes);
    case "FX":
      return null;
  }
}

function positionKey(input: { ownerType: OwnerType; accountKey: string; symbol: string; exchange: string }) {
  return `${input.ownerType}:${input.accountKey}:${input.symbol.toUpperCase()}:${input.exchange.toUpperCase()}`;
}

function yearsFromStart(start: Date, date: Date) {
  return (date.getTime() - start.getTime()) / DAY_MS / 365;
}

function xnpv(rate: number, flows: XirrFlow[]) {
  const start = new Date(`${flows[0].date}T12:00:00Z`);
  return flows.reduce((sum, flow) => {
    const years = yearsFromStart(start, new Date(`${flow.date}T12:00:00Z`));
    return sum + flow.amount / Math.pow(1 + rate, years);
  }, 0);
}

export function calculateXirr(inputFlows: XirrFlow[]) {
  const flows = [...inputFlows]
    .filter((flow) => Number.isFinite(flow.amount) && Math.abs(flow.amount) >= 0.005)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (flows.length < 2) return null;
  if (!flows.some((flow) => flow.amount < 0) || !flows.some((flow) => flow.amount > 0)) return null;
  if (flows[0].date === flows.at(-1)?.date) return null;

  let low = -0.999999;
  let high = 10;
  let lowValue = xnpv(low, flows);
  let highValue = xnpv(high, flows);
  for (let attempts = 0; Math.sign(lowValue) === Math.sign(highValue) && attempts < 20; attempts += 1) {
    high = high * 2 + 1;
    highValue = xnpv(high, flows);
  }
  if (Math.sign(lowValue) === Math.sign(highValue)) return null;

  for (let index = 0; index < 100; index += 1) {
    const mid = (low + high) / 2;
    const value = xnpv(mid, flows);
    if (Math.abs(value) < 0.000001) return mid;
    if (Math.sign(value) === Math.sign(lowValue)) {
      low = mid;
      lowValue = value;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

export function buildXirrSummary(input: {
  scope: Scope;
  positions: StoredPosition[];
  cashAccounts: CashAccount[];
  transactions: StoredTransaction[];
  asOfDate?: string | null;
}): XirrSummary {
  const flows: XirrFlow[] = [];
  const transactionPositionKeys = new Set<string>();

  for (const transaction of input.transactions) {
    if (transaction.type === "BUY" || transaction.type === "SELL") {
      transactionPositionKeys.add(positionKey(transaction));
    }
    const amount = transactionCashFlowAud(transaction);
    if (amount == null) continue;
    addFlow(flows, {
      date: transaction.settleDate ?? transaction.tradeDate,
      amount,
      source: transaction.source,
    });
  }

  let fallbackPositionCount = 0;
  for (const position of input.positions) {
    if (position.costAud <= 0) continue;
    if (transactionPositionKeys.has(positionKey(position))) continue;
    fallbackPositionCount += 1;
    addFlow(flows, {
      date: position.asOfDate,
      amount: -Math.abs(position.costAud),
      source: "cost-basis fallback",
    });
  }

  const terminalValue =
    input.positions.reduce((sum, position) => sum + position.marketValueAud, 0) +
    input.cashAccounts.reduce((sum, account) => sum + account.balanceAud, 0);
  const terminalDate = dateOnly(input.asOfDate ?? [
    ...input.positions.map((position) => position.asOfDate),
    ...input.cashAccounts.map((account) => account.asOfDate),
  ].sort().at(-1));
  addFlow(flows, { date: terminalDate, amount: terminalValue, source: "current NAV" });

  const sorted = flows.sort((left, right) => left.date.localeCompare(right.date));
  const annualizedRate = calculateXirr(sorted);
  const note = annualizedRate == null
    ? "Not enough dated cash-flow history yet."
    : fallbackPositionCount
      ? `Uses imported cash flows plus ${fallbackPositionCount} cost-basis fallback position${fallbackPositionCount === 1 ? "" : "s"}.`
      : "Uses imported trade, dividend and current NAV cash flows.";

  return {
    valuePercent: annualizedRate == null ? null : annualizedRate * 100,
    startDate: sorted[0]?.date ?? null,
    endDate: sorted.at(-1)?.date ?? null,
    cashFlowCount: sorted.length,
    fallbackPositionCount,
    terminalValue,
    note,
  };
}
