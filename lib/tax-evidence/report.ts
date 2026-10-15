import { createHash } from "node:crypto";
import { financialYear } from "@/lib/reports/eofy/utils";
import type { OwnerType, StoredTransaction } from "@/lib/storage/types";
import type { EvidenceReview, EvidenceSource } from "./types";
import { accountReference, displayAccount } from "./sources";
import { activeTransferReviews, isTransferCash } from "./transfers";
import { externalFxForReport } from "./external-fx";

export const evidenceDeclaration = "Transaction evidence only; Australian CGT and Division 775 forex tax treatment to be determined by the accountant.";
const numeric = (value: unknown): number | null => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function conversionEvidence(row: StoredTransaction) {
  if (row.type !== "FX") return null;
  const raw = row.raw ?? {};
  const pair = String(raw.symbol ?? row.symbol).toUpperCase().match(/^([A-Z]{3})[./]([A-Z]{3})$/);
  const quantity = numeric(row.quantity);
  const price = numeric(row.price);
  if (!pair || quantity == null || !quantity || price == null || price <= 0) return null;
  const baseAmount = quantity;
  const quoteAmount = numeric(raw.proceeds) ?? -quantity * price;
  if (baseAmount * quoteAmount >= 0 || !quoteAmount) return null;
  return {
    id: row.id, fromCurrency: quantity > 0 ? pair[2] : pair[1], fromAmount: Math.abs(quantity > 0 ? quoteAmount : baseAmount),
    toCurrency: quantity > 0 ? pair[1] : pair[2], toAmount: Math.abs(quantity > 0 ? baseAmount : quoteAmount),
    rate: quantity > 0 ? Math.abs(baseAmount / quoteAmount) : Math.abs(quoteAmount / baseAmount),
    rateBasis: numeric(raw.proceeds) != null ? "source quantity and proceeds" : "source quantity × execution price",
    fee: Math.abs(row.fees ?? 0), feeCurrency: String(raw.feeCurrency ?? raw.ibCommissionCurrency ?? row.currency).toUpperCase(),
    baseCurrency: pair[1], baseAmount, quoteCurrency: pair[2], quoteAmount,
  };
}

export type TaxEvidenceReport = ReturnType<typeof buildTaxEvidenceReport>;

export function buildTaxEvidenceReport(ownerType: OwnerType, transactions: StoredTransaction[], allSources: EvidenceSource[], allReviews: EvidenceReview[], year: number, generatedAt = new Date()) {
  const period = financialYear(year);
  const inPeriod = (date: string) => date >= period.startDate && date <= period.endDate;
  const owned = transactions.filter((row) => row.ownerType === ownerType);
  const selected = owned.filter((row) => inPeriod(row.tradeDate)).sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id.localeCompare(b.id));
  const sourcesById = new Map(allSources.filter((source) => source.ownerType === ownerType).map((source) => [source.id, source]));
  const exceptions: Array<{ code: string; transactionId: string | null; detail: string }> = [];
  const externalFx = externalFxForReport(ownerType, allSources, owned, period.startDate, period.endDate);
  exceptions.push(...externalFx.exceptions);
  const selectedIds = new Set(selected.map((row) => row.id));
  const active = activeTransferReviews(allReviews.filter((review) => review.ownerType === ownerType));
  for (const review of active) if (externalFx.explainedFunding.has(review.outgoingId)) exceptions.push({ code: "external_fx_double_assignment", transactionId: review.outgoingId,
    detail: "A withdrawal has both a confirmed cash-transfer match and a user-confirmed external FX declaration. Review the conflicting links." });
  const assigned = new Set([...active.flatMap((review) => [review.outgoingId, review.incomingId]), ...externalFx.explainedFunding]);
  const transferPairs: Array<{ outgoingId: string; incomingId: string; outgoingAccount: string; incomingAccount: string; outgoingDate: string; incomingDate: string;
    currency: string; outgoingAmount: number; incomingAmount: number; difference: number; status: "candidate" | "confirmed"; note: string }> = [];
  const cash = owned.filter(isTransferCash);
  const byCashId = new Map(cash.map((row) => [row.id, row]));
  const confirmedByOutgoing = new Map(active.map((review) => [review.outgoingId, review]));
  const dayNumber = (date: string) => Math.floor(Date.parse(date) / 86400000);
  const receipts = new Map<string, StoredTransaction[]>();
  for (const row of cash) if ((row.netCash ?? 0) > 0 && !assigned.has(row.id)) {
    const key = `${row.currency}:${Math.round(row.netCash! * 100)}:${dayNumber(row.tradeDate)}`;
    const bucket = receipts.get(key) ?? []; bucket.push(row); receipts.set(key, bucket);
  }
  let suggestions = 0;
  let suggestionsLimited = false;
  for (const outgoing of cash.filter((row) => (row.netCash ?? 0) < 0)) {
    const candidates: StoredTransaction[] = [];
    const confirmed = confirmedByOutgoing.get(outgoing.id);
    const confirmedIncoming = confirmed ? byCashId.get(confirmed.incomingId) : undefined;
    if (confirmedIncoming) candidates.push(confirmedIncoming);
    if (!assigned.has(outgoing.id)) {
      if (suggestions >= 1000) suggestionsLimited = true;
      else for (let offset = -7; offset <= 7 && suggestions + candidates.length < 1000; offset++) {
        for (let cents = -1; cents <= 1 && suggestions + candidates.length < 1000; cents++) {
          const key = `${outgoing.currency}:${Math.round(Math.abs(outgoing.netCash!) * 100) + cents}:${dayNumber(outgoing.tradeDate) + offset}`;
          for (const row of receipts.get(key) ?? []) {
            if ((selectedIds.has(outgoing.id) || selectedIds.has(row.id)) && Math.abs(Math.abs(outgoing.netCash!) - row.netCash!) <= 0.01
              && !(outgoing.broker === row.broker && outgoing.accountKey === row.accountKey)) candidates.push(row);
            if (suggestions + candidates.length >= 1000) { suggestionsLimited = true; break; }
          }
        }
      }
    }
    for (const incoming of candidates) {
      if (!selectedIds.has(outgoing.id) && !selectedIds.has(incoming.id)) continue;
      const review = confirmed?.incomingId === incoming.id ? confirmed : undefined;
      if (!review) {
        if (assigned.has(outgoing.id) || assigned.has(incoming.id)) continue;
        if (outgoing.currency !== incoming.currency || (outgoing.broker === incoming.broker && outgoing.accountKey === incoming.accountKey)) continue;
        const days = Math.abs(Date.parse(outgoing.tradeDate) - Date.parse(incoming.tradeDate)) / 86400000;
        if (days > 7 || Math.abs(Math.abs(outgoing.netCash!) - incoming.netCash!) > 0.01) continue;
      }
      transferPairs.push({ outgoingId: outgoing.id, incomingId: incoming.id, outgoingAccount: displayAccount(outgoing.broker, outgoing.accountKey),
        incomingAccount: displayAccount(incoming.broker, incoming.accountKey), outgoingDate: outgoing.tradeDate, incomingDate: incoming.tradeDate,
        currency: outgoing.currency, outgoingAmount: Math.abs(outgoing.netCash!), incomingAmount: incoming.netCash!, difference: incoming.netCash! + outgoing.netCash!,
        status: review ? "confirmed" : "candidate", note: review?.note ?? "Possible transfer only; compare references and statements before confirming." });
      if (!review) suggestions++;
    }
  }
  if (suggestionsLimited) exceptions.push({ code: "transfer_suggestions_limited", transactionId: null,
    detail: "Showing up to 1,000 possible transfer pairs. All cash records are retained; use manual review for additional or ambiguous pairs." });
  const rows = selected.map((row) => {
    const sourceId = typeof row.raw?._evidenceSourceId === "string" ? row.raw._evidenceSourceId : null;
    const source = sourceId ? sourcesById.get(sourceId) : undefined;
    if (!source) exceptions.push({ code: "missing_source_file", transactionId: row.id, detail: "Original statement file is missing; a persisted transaction is not an original statement." });
    const fx = conversionEvidence(row);
    if (row.type === "FX" && !fx) exceptions.push({ code: "missing_conversion_legs", transactionId: row.id, detail: "Both currency legs and an executed price/proceeds are required; no conversion rate was invented." });
    if (row.raw?._sourceIdQuality === "file_row" || row.raw?._sourceIdQuality === "composite") exceptions.push({ code: "composite_source_id", transactionId: row.id, detail: "Source supplied no stable transaction ID. Review overlapping statements for duplicate cash events." });
    if (isTransferCash(row) && !assigned.has(row.id)) exceptions.push({ code: "unmatched_cash", transactionId: row.id, detail: "Cash movement has no confirmed transfer pair; it may be income, a fee, an external payment or an unmatched transfer. Accountant review required." });
    return { id: row.id, ownerType, source: row.source, sourceId: source?.id ?? null, sourceSha256: source?.sha256 ?? null,
      account: displayAccount(row.broker, row.accountKey), accountRef: accountReference(row.broker, row.accountKey),
      externalId: row.accountKey.length > 4 ? row.externalId.replaceAll(row.accountKey, `…${row.accountKey.slice(-3)}`) : row.externalId,
      category: row.type === "FX" ? "Currency conversion" : row.type === "BUY" || row.type === "SELL" ? `Security ${row.type.toLowerCase()}` : String(row.raw?._evidenceCategory ?? row.type),
      type: row.type, date: row.tradeDate, settlementDate: row.settleDate ?? null,
      originalDate: String(row.raw?._originalDate ?? row.raw?.dateTime ?? row.raw?.tradeDate ?? row.tradeDate),
      bookedDate: String(row.raw?.reportDate ?? "") || null, timezone: String(row.raw?.timeZone ?? source?.metadata.timezone ?? "") || null,
      description: row.description ?? row.symbol, currency: row.currency, amount: numeric(row.netCash), grossAmount: numeric(row.cost),
      fee: numeric(row.fees), feeCurrency: String(row.raw?.feeCurrency ?? row.raw?.ibCommissionCurrency ?? row.currency), taxes: numeric(row.taxes),
      symbol: row.symbol, quantity: numeric(row.quantity), price: numeric(row.price),
      fxRateToAud: numeric(row.fxRateToBase), fxRateEvidence: String(row.raw?._fxRateOrigin ?? "Stored normalization rate; verify provenance in original source"), fx,
    };
  });
  const referencedSources = new Set([...rows.map((row) => row.sourceId), ...externalFx.referencedSourceIds]);
  const sources = [...sourcesById.values()].filter((source) => (source.startDate <= period.endDate && source.endDate >= period.startDate) || referencedSources.has(source.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const system of (ownerType === "PERSONAL" ? ["IBKR", "Westpac", "Macquarie", "Artwork"] : ["IBKR"])) {
    if (!sources.some((source) => source.system === system)) exceptions.push({ code: "missing_evidence", transactionId: null, detail: `Missing evidence: no ${system} source document supplied for this financial year.` });
  }
  for (const source of sources) {
    if (!source.metadata.timezone) exceptions.push({ code: "source_timezone_unknown", transactionId: null, detail: `${source.filename}: broker/bank timezone not supplied. Reporting uses the original source calendar date; verify year-end cutoffs.` });
    if (source.system === "IBKR") {
      const sections = source.metadata.sections ?? [];
      const tradeConfirmOnly = sections.includes("TradeConfirms") && !sections.includes("Trades");
      if (!tradeConfirmOnly) {
        if (!sections.includes("Trades")) exceptions.push({ code: "missing_trades_section", transactionId: null, detail: `${source.filename}: Trades section was not supplied. FX executions may be absent; the Activity Flex query must include currency trades for the required dates.` });
        if (!sections.includes("CashTransactions")) exceptions.push({ code: "missing_cash_section", transactionId: null, detail: `${source.filename}: Cash Transactions section was not supplied. Deposits and withdrawals may be absent.` });
        if (!sections.includes("CashReport")) exceptions.push({ code: "missing_cash_report_section", transactionId: null, detail: `${source.filename}: Cash Report section was not supplied. Per-currency opening and closing balances are unavailable from this response.` });
      }
    }
  }
  const accounts = new Map<string, { account: string; currency: string; opening: number | null; closing: number | null; movement: number; missingMovements: number; balanceSources: string[]; balanceConflict: boolean }>();
  const account = (system: string, key: string, currency: string) => {
    const ref = `${accountReference(system, key)}:${currency}`;
    if (!accounts.has(ref)) accounts.set(ref, { account: displayAccount(system, key), currency, opening: null, closing: null, movement: 0, missingMovements: 0, balanceSources: [], balanceConflict: false });
    return accounts.get(ref)!;
  };
  for (const source of sources) for (const balance of source.metadata.balances ?? []) {
    const total = account(source.system, source.accountKey, balance.currency);
    if (balance.startDate === period.startDate && balance.opening != null) {
      if (total.opening != null && Math.abs(total.opening - balance.opening) > 0.01) {
        total.balanceConflict = true;
        exceptions.push({ code: "conflicting_balance", transactionId: null, detail: `${total.account} ${balance.currency}: conflicting opening statement balances.` });
      }
      total.opening = balance.opening;
    }
    if (balance.endDate === period.endDate && balance.closing != null) {
      if (total.closing != null && Math.abs(total.closing - balance.closing) > 0.01) {
        total.balanceConflict = true;
        exceptions.push({ code: "conflicting_balance", transactionId: null, detail: `${total.account} ${balance.currency}: conflicting closing statement balances.` });
      }
      total.closing = balance.closing;
    }
    total.balanceSources.push(source.id);
  }
  const currencyTotals = new Map<string, { currency: string; cashReceipts: number; cashPayments: number; convertedIn: number; convertedOut: number; fees: number }>();
  const currencyTotal = (currency: string) => {
    if (!currencyTotals.has(currency)) currencyTotals.set(currency, { currency, cashReceipts: 0, cashPayments: 0, convertedIn: 0, convertedOut: 0, fees: 0 });
    return currencyTotals.get(currency)!;
  };
  for (const row of selected) {
    const fx = conversionEvidence(row);
    if (fx) {
      const base = account(row.broker, row.accountKey, fx.baseCurrency);
      const quote = account(row.broker, row.accountKey, fx.quoteCurrency);
      base.movement += fx.baseAmount;
      quote.movement += row.netCash != null && row.currency === fx.quoteCurrency ? row.netCash : fx.quoteAmount;
      if (fx.fee && !(row.netCash != null && row.currency === fx.quoteCurrency && fx.feeCurrency === fx.quoteCurrency)) account(row.broker, row.accountKey, fx.feeCurrency).movement -= fx.fee;
      currencyTotal(fx.fromCurrency).convertedOut += fx.fromAmount;
      currencyTotal(fx.toCurrency).convertedIn += fx.toAmount;
    } else {
      const total = account(row.broker, row.accountKey, row.currency);
      if (row.netCash == null) total.missingMovements++; else total.movement += row.netCash;
      if (isTransferCash(row)) {
        const currency = currencyTotal(row.currency);
        if (row.netCash! >= 0) currency.cashReceipts += row.netCash!; else currency.cashPayments += Math.abs(row.netCash!);
      }
    }
    if (row.fees) currencyTotal(String(row.raw?.feeCurrency ?? row.raw?.ibCommissionCurrency ?? row.currency)).fees += Math.abs(row.fees);
    if (row.type === "CASH_ACTIVITY" && row.raw?._evidenceCategory === "Bank fee" && row.netCash != null) currencyTotal(row.currency).fees += Math.abs(row.netCash);
  }
  const balances = [...accounts.entries()].map(([id, row]) => {
    const variance = !row.balanceConflict && row.opening != null && row.closing != null && !row.missingMovements ? row.opening + row.movement - row.closing : null;
    const status = row.balanceConflict ? "conflicting_evidence" : variance == null ? "missing_evidence" : Math.abs(variance) > 0.01 ? "difference" : "arithmetic_matches";
    if (status !== "arithmetic_matches") exceptions.push({ code: `cash_${status}`, transactionId: null, detail: `${row.account} ${row.currency}: ${variance == null ? "year-end statement balances or cash movements are missing" : `cash roll-forward differs by ${variance.toFixed(2)}`}.` });
    return { id, ...row, variance, status };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const reviews = allReviews.filter((review) => review.ownerType === ownerType && (selectedIds.has(review.outgoingId) || selectedIds.has(review.incomingId)));
  const inputHash = hash({ ownerType, year, transactions: selected, sources: sources.map((source) => ({ ...source, importedAt: source.importedAt })), reviews, externalFx: externalFx.rows });
  return { version: "tax-evidence-v2", ownerType, period, generatedAt: generatedAt.toISOString(), timezone: "Australia/Sydney", dateBasis: "Original broker/bank calendar date; external declarations retain month precision when exact dates are unknown", declaration: evidenceDeclaration,
    inputHash, transactions: rows, conversions: rows.flatMap((row) => row.fx ? [{ ...row.fx, date: row.date, account: row.account, sourceId: row.sourceId }] : []),
    externalFx: externalFx.rows, transfers: transferPairs, balances, currencyTotals: [...currencyTotals.values()].sort((a, b) => a.currency.localeCompare(b.currency)), exceptions, reviews,
    sources: sources.map(({ accountKey, ...source }) => ({ ...source, account: displayAccount(source.system, accountKey), filename: source.filename.replaceAll(accountKey, `…${accountKey.slice(-3)}`) })) };
}
