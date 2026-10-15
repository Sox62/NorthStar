import type { OwnerType, StoredTransaction } from "@/lib/storage/types";
import type { EvidenceImport, EvidenceSource, EvidenceSourceInput, ExternalFxEvidence } from "./types";
import { evidenceDate } from "./bank-csv";
import { displayAccount } from "./sources";

export function readExternalFx(input: Record<string, unknown>, author: string): ExternalFxEvidence {
  const text = (key: string, max: number, required = false) => {
    const value = String(input[key] ?? "").trim();
    if ((required && !value) || value.length > max) throw new Error(`Supply a valid ${key} (up to ${max} characters).`);
    return value || null;
  };
  const positive = (key: string, optional = false) => {
    if (optional && (input[key] == null || String(input[key]).trim() === "")) return null;
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive amount.`);
    return value;
  };
  const month = text("month", 7, true)!;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2000 || Number(month.slice(0, 4)) > 2100) throw new Error("Choose a valid activity month.");
  const rawDate = text("conversionDate", 10);
  const conversionDate = rawDate ? evidenceDate(rawDate) : null;
  if (conversionDate && !conversionDate.startsWith(month)) throw new Error("The exact conversion date must be in the selected month.");
  const currency = (key: string) => {
    const value = String(input[key] ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(value)) throw new Error(`Supply a three-letter ${key}.`);
    return value;
  };
  const fromCurrency = currency("fromCurrency"), toCurrency = currency("toCurrency");
  if (fromCurrency === toCurrency) throw new Error("An FX conversion needs two different currencies.");
  const pairingStatus = String(input.pairingStatus ?? "provisional");
  const evidenceBasis = String(input.evidenceBasis ?? "user_reported");
  if (pairingStatus !== "provisional" && pairingStatus !== "user_confirmed") throw new Error("Choose provisional or confirmed by user.");
  if (evidenceBasis !== "user_reported" && evidenceBasis !== "provider_confirmation") throw new Error("Choose user-reported amounts or provider confirmation.");
  let feeAmount: number | null = null;
  if (input.feeAmount != null && String(input.feeAmount).trim() !== "") {
    feeAmount = Number(input.feeAmount);
    if (!Number.isFinite(feeAmount) || feeAmount < 0) throw new Error("Fees must be zero, a positive amount, or blank when unknown.");
  }
  const feeCurrency = feeAmount == null ? null : currency("feeCurrency");
  const fundingTransactionId = text("fundingTransactionId", 36);
  if (fundingTransactionId && !/^[a-f0-9-]{36}$/i.test(fundingTransactionId)) throw new Error("Choose a recorded funding withdrawal.");
  return { provider: text("provider", 120, true)!, reference: text("reference", 200), month, conversionDate,
    fromCurrency, fromAmount: positive("fromAmount")!, toCurrency, toAmount: positive("toAmount")!, quotedRate: positive("quotedRate", true),
    feeAmount, feeCurrency, fundingTransactionId, pairingStatus, evidenceBasis, note: text("note", 4000, true)!, author };
}

export function validateExternalFunding<T extends Pick<StoredTransaction, "id" | "ownerType" | "type" | "netCash" | "currency">>(row: ExternalFxEvidence, transactions: T[], owner: OwnerType) {
  if (!row.fundingTransactionId) return null;
  const funding = transactions.find((item) => item.id === row.fundingTransactionId && item.ownerType === owner);
  if (!funding || !["CASH_ACTIVITY", "DEPOSIT", "WITHDRAWAL"].includes(funding.type) || (funding.netCash ?? 0) >= 0
    || funding.currency !== row.fromCurrency || Math.abs(Math.abs(funding.netCash!) - row.fromAmount) > 0.005) throw new Error("The funding record must be this owner's withdrawal in the source currency and amount.");
  return funding;
}

/** A declaration annotates source evidence; it never creates a second cash/FX ledger entry. */
export function externalFxImport(row: ExternalFxEvidence, accountKey: string, supportingSourceIds: string[], additionalSources: EvidenceSourceInput[] = []): EvidenceImport {
  const startDate = `${row.month}-01`;
  const endDate = new Date(Date.UTC(Number(row.month.slice(0, 4)), Number(row.month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const declaration = { version: "external-fx-evidence-v1", ...row, supportingSourceIds: [...new Set(supportingSourceIds)].sort() };
  return { transactions: [], additionalSources, source: { system: "External FX", accountKey, filename: `${row.month}_FX_declaration.json`, mediaType: "application/json",
    contentBase64: Buffer.from(JSON.stringify(declaration, null, 2)).toString("base64"), startDate, endDate,
    metadata: { sections: ["External FX declaration"], timezone: null, coverageBasis: row.conversionDate ? "User-specified conversion date" : "Month reported by user; exact conversion date unknown",
      externalFx: row, supportingSourceIds: declaration.supportingSourceIds } } };
}

export function externalFxForReport(owner: OwnerType, sources: EvidenceSource[], transactions: StoredTransaction[], start: string, end: string, includeIds = new Set<string>()) {
  const rows: Array<ExternalFxEvidence & { id: string; account: string; amountImpliedRate: number; fundingAccount: string | null; fundingDate: string | null; supportingSourceIds: string[] }> = [];
  const exceptions: Array<{ code: string; transactionId: string | null; detail: string }> = [];
  const explainedFunding = new Set<string>();
  const referencedSourceIds = new Set<string>();
  const ownedSources = sources.filter((source) => source.ownerType === owner);
  const sourceIds = new Set(ownedSources.map((source) => source.id));
  const identity = new Map<string, string>();
  for (const source of ownedSources) {
    if (source.system !== "External FX" || !source.metadata.externalFx) continue;
    let declaration: ExternalFxEvidence;
    try { declaration = readExternalFx(source.metadata.externalFx as unknown as Record<string, unknown>, source.metadata.externalFx.author); }
    catch { exceptions.push({ code: "invalid_external_fx", transactionId: null, detail: `External FX declaration ${source.id} is invalid and needs review.` }); continue; }
    const date = declaration.conversionDate ?? `${declaration.month}-01`;
    if ((date < start || date > end) && !includeIds.has(source.id)) continue;
    let funding: StoredTransaction | null = null;
    try { funding = validateExternalFunding(declaration, transactions, owner); }
    catch { exceptions.push({ code: "external_fx_funding_mismatch", transactionId: declaration.fundingTransactionId, detail: `${declaration.provider}: linked funding record does not agree with the declared currency/amount/owner.` }); }
    if (!funding) exceptions.push({ code: "external_fx_unlinked", transactionId: null, detail: `${declaration.provider} ${declaration.month}: no matching recorded funding withdrawal is linked.` });
    if (!declaration.conversionDate) exceptions.push({ code: "external_fx_date_unknown", transactionId: null, detail: `${declaration.provider} ${declaration.month}: exact FX conversion date is unknown. The declaration retains month precision; receiving-bank dates are tracked separately.` });
    if (declaration.evidenceBasis === "user_reported") exceptions.push({ code: "external_fx_user_reported", transactionId: null, detail: `${declaration.provider} ${declaration.month}: amounts are user-reported; the ratio is not a confirmed execution rate.` });
    if (declaration.feeAmount == null) exceptions.push({ code: "external_fx_fee_unknown", transactionId: null, detail: `${declaration.provider} ${declaration.month}: provider fees are unknown, not assumed zero.` });
    const support = source.metadata.supportingSourceIds ?? [];
    referencedSourceIds.add(source.id);
    for (const id of support) {
      referencedSourceIds.add(id);
      if (!sourceIds.has(id)) exceptions.push({ code: "external_fx_support_missing", transactionId: null, detail: `${declaration.provider}: linked source ${id} is unavailable in this owner's evidence.` });
    }
    if (typeof funding?.raw?._evidenceSourceId === "string") referencedSourceIds.add(funding.raw._evidenceSourceId);
    if (funding && declaration.pairingStatus === "user_confirmed") explainedFunding.add(funding.id);
    const key = declaration.fundingTransactionId ? `funding:${declaration.fundingTransactionId}` : declaration.reference ? `reference:${source.accountKey}:${declaration.provider}:${declaration.reference}` : null;
    if (key && identity.has(key)) exceptions.push({ code: "external_fx_duplicate_reference", transactionId: declaration.fundingTransactionId, detail: `${declaration.provider}: more than one declaration refers to the same funding withdrawal/reference. Review sources; no extra cash movement was created.` });
    if (key) identity.set(key, source.id);
    rows.push({ ...declaration, id: source.id, account: displayAccount(source.system, source.accountKey), amountImpliedRate: declaration.toAmount / declaration.fromAmount,
      fundingAccount: funding ? displayAccount(funding.broker, funding.accountKey) : null, fundingDate: funding?.tradeDate ?? null, supportingSourceIds: support.filter((id) => sourceIds.has(id)) });
  }
  return { rows: rows.sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id)), exceptions, explainedFunding, referencedSourceIds };
}
