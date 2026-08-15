import type { OwnerType, StoredTransaction } from "@/lib/storage";
import { taxJurisdiction, type TaxJurisdictionCode } from "@/lib/tax-jurisdictions";
import type { EofyScope } from "./types";

export function ownerTypeForEofyScope(_scope: EofyScope): OwnerType {
  return "PERSONAL";
}

export function ownerLabelForEofyScope(_scope: EofyScope) {
  return "Personal";
}

export function defaultTaxYearEnding(jurisdictionCode: TaxJurisdictionCode, today = new Date()) {
  const jurisdiction = taxJurisdiction(jurisdictionCode);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();
  const startsInJanuary = jurisdiction.yearStartMonth === 1;
  const hasReachedTaxYearStart = month > jurisdiction.yearStartMonth || (month === jurisdiction.yearStartMonth && day >= jurisdiction.yearStartDay);
  return startsInJanuary || hasReachedTaxYearStart ? year : year - 1;
}

export function defaultFinancialYearEnding(today = new Date()) {
  return defaultTaxYearEnding("AU", today);
}

export function taxYearFromRequest(jurisdictionCode: TaxJurisdictionCode, value: string | null, today = new Date()) {
  const fallback = defaultTaxYearEnding(jurisdictionCode, today);
  const parsed = value ? Number(value) : fallback;
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return fallback;
  return parsed;
}

export function financialYearFromRequest(value: string | null, today = new Date()) {
  return taxYearFromRequest("AU", value, today);
}

export function taxYear(jurisdictionCode: TaxJurisdictionCode, year: number) {
  const jurisdiction = taxJurisdiction(jurisdictionCode);
  const startYear = jurisdiction.yearStartMonth === 1 ? year : year - 1;
  return {
    year,
    label: jurisdiction.taxYearBasis === "calendar_year" ? String(year) : `FY${year}`,
    startDate: `${startYear}-${String(jurisdiction.yearStartMonth).padStart(2, "0")}-${String(jurisdiction.yearStartDay).padStart(2, "0")}`,
    endDate: `${year}-${String(jurisdiction.yearEndMonth).padStart(2, "0")}-${String(jurisdiction.yearEndDay).padStart(2, "0")}`,
  };
}

export function financialYear(year: number) {
  return taxYear("AU", year);
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
