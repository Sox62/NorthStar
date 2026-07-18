import type { OwnerType, StoredTransaction } from "@/lib/storage";
import type { EofyScope } from "./types";

export function ownerTypeForEofyScope(_scope: EofyScope): OwnerType {
  return "PERSONAL";
}

export function ownerLabelForEofyScope(_scope: EofyScope) {
  return "Personal";
}

export function defaultFinancialYearEnding(today = new Date()) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  return month >= 7 ? year : year - 1;
}

export function financialYearFromRequest(value: string | null, today = new Date()) {
  const parsed = value ? Number(value) : defaultFinancialYearEnding(today);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return defaultFinancialYearEnding(today);
  return parsed;
}

export function financialYear(year: number) {
  return {
    year,
    label: `FY${year}`,
    startDate: `${year - 1}-07-01`,
    endDate: `${year}-06-30`,
  };
}

export function dateInRange(value: string | null | undefined, startDate: string, endDate: string) {
  return Boolean(value && value >= startDate && value <= endDate);
}

export function amount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function rawAmount(transaction: StoredTransaction, keys: string[]) {
  const raw = transaction.raw;
  if (!raw) return 0;
  for (const key of keys) {
    const value = amount(raw[key]);
    if (value) return value;
  }
  return 0;
}

export function rawString(transaction: StoredTransaction, keys: string[]) {
  const raw = transaction.raw;
  if (!raw) return "";
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function transactionAud(value: number | null | undefined, transaction: StoredTransaction) {
  if (!value) return 0;
  return transaction.currency === "AUD" ? value : value * (transaction.fxRateToBase ?? 1);
}

export function transactionGrossAud(transaction: StoredTransaction) {
  return Math.abs(transactionAud(transaction.cost, transaction));
}

export function transactionNetCashAud(transaction: StoredTransaction) {
  return transactionAud(transaction.netCash, transaction);
}
