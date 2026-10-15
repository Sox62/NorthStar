import type { StoredTransaction } from "@/lib/storage";

/**
 * What a transaction's money fields are denominated in, and whether they can be converted.
 *
 * Two importers disagreed about one field and nothing recorded which was which. A Directshares
 * export states brokerage in AUD however the trade was priced; IBKR states the commission in the
 * currency it was charged in, usually the trade's. The parcel engine added fees without converting
 * and the EOFY schedules always converted them, so each was right for one importer and wrong for
 * the other — over-converting Directshares brokerage by the exchange rate, and under-converting
 * IBKR's by the same.
 */

/** A rate only converts if it is a positive number; zero and null are absences, not parity. */
export function usableFxRate(transaction: Pick<StoredTransaction, "currency" | "fxRateToBase">) {
  if (transaction.currency === "AUD") return 1;
  const rate = transaction.fxRateToBase;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * A foreign row whose AUD value cannot be known from what is stored.
 *
 * Treating a missing rate as 1 produced an AUD figure that looks like a measurement and is not one:
 * a USD100 buy reported a cost base of AUD100. Reporting it is the only honest handling — the
 * arithmetic still has to produce something, so the number carries a warning rather than a
 * silence.
 */
export function foreignWithoutFx(transaction: Pick<StoredTransaction, "currency" | "fxRateToBase">) {
  return transaction.currency !== "AUD" && usableFxRate(transaction) == null;
}

/** Converts an amount denominated in the transaction's own currency. */
export function transactionAmountAud(value: number | null | undefined, transaction: Pick<StoredTransaction, "currency" | "fxRateToBase">) {
  return (value ?? 0) * (usableFxRate(transaction) ?? 1);
}

/**
 * The currency a row's fees and taxes are stated in.
 *
 * Importers record it from the source where the source says — IBKR's Flex gives
 * `ibCommissionCurrency` outright. Rows stored before the field existed fall back to what their
 * importer is known to have done, which is the only reading of them that is ever right.
 */
export function feeCurrencyFor(transaction: Pick<StoredTransaction, "currency" | "source" | "raw">) {
  const stated = transaction.raw?.feeCurrency;
  if (typeof stated === "string" && stated.trim()) return stated.trim().toUpperCase();
  // Both Directshares exports state brokerage in AUD, whatever the instrument is priced in.
  if ((transaction.source ?? "").toLowerCase().includes("directshares")) return "AUD";
  return (transaction.currency ?? "AUD").toUpperCase();
}

/**
 * Fees and taxes in AUD.
 *
 * Returns null where the stated fee currency is neither AUD nor the transaction's own — a third
 * currency has no rate on the row to convert through, and inventing one would be the same mistake
 * in a different place.
 */
export function feesAud(transaction: Pick<StoredTransaction, "currency" | "fxRateToBase" | "fees" | "taxes" | "source" | "raw">) {
  const amount = Math.abs(transaction.fees ?? 0) + Math.abs(transaction.taxes ?? 0);
  if (!amount) return 0;
  const feeCurrency = feeCurrencyFor(transaction);
  if (feeCurrency === "AUD") return amount;
  if (feeCurrency !== (transaction.currency ?? "AUD").toUpperCase()) return null;
  const rate = usableFxRate(transaction);
  return rate == null ? null : amount * rate;
}
