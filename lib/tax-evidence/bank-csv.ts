import { parse } from "csv-parse/sync";
import type { ImportedTransaction } from "@/lib/integrations/types";
import type { EvidenceImport, EvidenceSystem } from "./types";
import { sourceHash } from "./sources";

export function evidenceDate(value: string) {
  const text = value.trim();
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(Date.parse(`${iso}T00:00:00Z`))
    || new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) throw new Error("Use a valid date as YYYY-MM-DD or DD/MM/YYYY.");
  return iso;
}

function money(value: string | undefined) {
  if (value == null || !value.trim()) return null;
  const raw = value.trim().replace(/[$,\s]/g, "");
  if (!/^(?:-?\d+(?:\.\d+)?|\(\d+(?:\.\d+)?\))$/.test(raw)) throw new Error("A bank amount is not a valid number.");
  const parsed = Number(raw.replace(/^\((.*)\)$/, "-$1"));
  if (!Number.isFinite(parsed)) throw new Error("A bank amount is not finite.");
  return parsed;
}

/** Explicit source/account/currency prevent a bank label from silently choosing a legal owner. */
export function parseBankEvidenceCsv(content: Buffer, input: {
  system: Extract<EvidenceSystem, "Westpac" | "Macquarie">; accountKey: string; currency: string;
  filename: string; startDate: string; endDate: string; opening?: number | null; closing?: number | null;
}): EvidenceImport {
  const hash = sourceHash(content);
  const records = parse(content, { columns: true, bom: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  if (!records.length) throw new Error("The statement contains no transaction rows.");
  const seen = new Map<string, number>();
  const transactions = records.map((original, index): ImportedTransaction => {
    const row = Object.fromEntries(Object.entries(original).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), value]));
    const read = (...keys: string[]) => keys.map((key) => row[key]).find((value) => value?.trim()) ?? "";
    const dateString = read("date", "transactiondate", "value date", "valuedate");
    const tradeDate = evidenceDate(dateString);
    if (tradeDate < input.startDate || tradeDate > input.endDate) throw new Error(`Row ${index + 1} is outside the declared statement period.`);
    const signed = money(read("amount", "transactionamount"));
    const debit = money(read("debit", "debitamount", "withdrawal", "withdrawals"));
    const credit = money(read("credit", "creditamount", "deposit", "deposits"));
    if (signed == null && debit == null && credit == null) throw new Error(`Row ${index + 1} needs Amount or Debit/Credit columns.`);
    const value = signed ?? Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
    const currency = (read("currency", "ccy") || input.currency).toUpperCase();
    if (currency !== input.currency) throw new Error(`Row ${index + 1} has a different currency. Import one account/currency per statement.`);
    const description = read("description", "transactiondescription", "details", "narrative");
    const transactionId = read("transactionid", "id");
    const reference = read("transactionreference", "reference");
    const balance = money(read("balance", "runningbalance"));
    const composite = sourceHash(JSON.stringify([input.system, input.accountKey, tradeDate, currency, value, description, reference, balance]));
    const count = (seen.get(composite) ?? 0) + 1;
    seen.set(composite, count);
    // With neither a bank ID nor a running balance, overlapping statements are ambiguous. Keep
    // their rows separately and surface duplicate candidates; never silently delete a real payment.
    const externalId = transactionId ? `BANK:${transactionId}` : balance != null ? `BANK:${composite}:${count}` : `BANK:${hash}:${index + 1}`;
    const valueDate = read("valuedate", "settlementdate");
    return { externalId, externalAccountId: input.accountKey, tradeDate, settleDate: valueDate ? evidenceDate(valueDate) : undefined,
      symbol: currency, exchange: "", description, type: "CASH_ACTIVITY", currency, netCash: value, source: `${input.system} Statement`,
      raw: { ...original, _sourceSha256: hash, _originalDate: dateString, _evidenceCategory: read("category", "type") || (value >= 0 ? "Cash receipt" : "Cash payment"),
        _sourceIdQuality: transactionId ? "bank_id" : balance != null ? "composite" : "file_row", _bankReference: reference,
        _duplicateCandidateKey: composite, _statementBalance: balance, timeZone: read("timezone") || undefined } };
  });
  return { transactions, source: { system: input.system, accountKey: input.accountKey, filename: input.filename, mediaType: "text/csv",
    contentBase64: content.toString("base64"), startDate: input.startDate, endDate: input.endDate,
    metadata: { timezone: null, sections: ["Bank transactions"], evidenceBasis: [...new Set(records.map((row) => row.EvidenceBasis).filter(Boolean))].join("; ") || null,
      coverageBasis: "Period declared on import; verify against original statement",
      balances: [{ currency: input.currency, startDate: input.startDate, endDate: input.endDate, opening: input.opening ?? null, closing: input.closing ?? null }],
      balanceBasis: "Opening/closing balances declared on import" } } };
}
