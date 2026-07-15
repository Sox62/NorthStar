import type { CashAccount, CurrencyExposure, StoredPosition } from "./types";

type CurrencyBucket = {
  amountAud: number;
  positionValueAud: number;
  cashValueAud: number;
  positionCount: number;
};

function normaliseCurrency(value: string | null | undefined) {
  return (value || "AUD").trim().toUpperCase() || "AUD";
}

export function buildCurrencyExposure(positions: StoredPosition[], cashAccounts: CashAccount[], totalValue: number): CurrencyExposure[] {
  const buckets = new Map<string, CurrencyBucket>();
  for (const position of positions) {
    const currency = normaliseCurrency(position.currency);
    const bucket = buckets.get(currency) ?? { amountAud: 0, positionValueAud: 0, cashValueAud: 0, positionCount: 0 };
    bucket.amountAud += position.marketValueAud;
    bucket.positionValueAud += position.marketValueAud;
    bucket.positionCount += 1;
    buckets.set(currency, bucket);
  }

  for (const account of cashAccounts) {
    const currency = normaliseCurrency(account.currency);
    const bucket = buckets.get(currency) ?? { amountAud: 0, positionValueAud: 0, cashValueAud: 0, positionCount: 0 };
    bucket.amountAud += account.balanceAud;
    bucket.cashValueAud += account.balanceAud;
    buckets.set(currency, bucket);
  }

  return [...buckets.entries()]
    .map(([currency, bucket]) => ({
      currency,
      amountAud: bucket.amountAud,
      valuePercent: totalValue ? (bucket.amountAud / totalValue) * 100 : 0,
      positionValueAud: bucket.positionValueAud,
      cashValueAud: bucket.cashValueAud,
      positionCount: bucket.positionCount,
    }))
    .filter((item) => item.amountAud > 0)
    .sort((a, b) => b.amountAud - a.amountAud);
}
