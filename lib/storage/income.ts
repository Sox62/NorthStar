import type { IncomeSummary, StoredTransaction } from "./types";

function amount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function transactionAud(value: number | null | undefined, transaction: StoredTransaction) {
  if (!value) return 0;
  if (transaction.currency === "AUD") return value;
  return value * (transaction.fxRateToBase ?? 1);
}

function rawAmount(transaction: StoredTransaction, keys: string[]) {
  const raw = transaction.raw;
  if (!raw) return 0;
  for (const key of keys) {
    const value = amount(raw[key]);
    if (value) return value;
  }
  return 0;
}

export function buildIncomeSummary(transactions: StoredTransaction[], navAud: number, periodEnd = new Date()): IncomeSummary {
  const end = new Date(periodEnd);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);

  const dividends = transactions.filter((transaction) => {
    if (transaction.type !== "DIVIDEND") return false;
    const date = new Date(`${transaction.tradeDate}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date >= start && date <= end;
  });

  const symbols = new Map<string, IncomeSummary["symbols"][number]>();
  let netCashAud = 0;
  let taxWithheldAud = 0;
  let frankingCreditsAud = 0;
  let grossIncomeAud = 0;

  for (const dividend of dividends) {
    const net = transactionAud(dividend.netCash ?? 0, dividend);
    const withheld = transactionAud(dividend.taxes ?? 0, dividend);
    const franking = rawAmount(dividend, ["frankingCreditAud", "frankingCredit"]);
    const rawGross = rawAmount(dividend, ["grossDividendAud", "grossDividend"]);
    const gross = rawGross || net + withheld + franking;
    const symbol = dividend.symbol || "Income";
    const row = symbols.get(symbol) ?? { symbol, payments: 0, netCashAud: 0, taxWithheldAud: 0, frankingCreditsAud: 0, grossIncomeAud: 0 };

    row.payments += 1;
    row.netCashAud += net;
    row.taxWithheldAud += withheld;
    row.frankingCreditsAud += franking;
    row.grossIncomeAud += gross;
    symbols.set(symbol, row);

    netCashAud += net;
    taxWithheldAud += withheld;
    frankingCreditsAud += franking;
    grossIncomeAud += gross;
  }

  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    dividendCount: dividends.length,
    netCashAud,
    taxWithheldAud,
    frankingCreditsAud,
    grossIncomeAud,
    grossedUpYieldPercent: navAud ? (grossIncomeAud / navAud) * 100 : null,
    symbols: [...symbols.values()].sort((a, b) => b.grossIncomeAud - a.grossIncomeAud).slice(0, 6),
    note: dividends.length ? "Trailing 12-month dividend income from imported transactions." : "No imported dividend payments in the trailing 12 months.",
  };
}
