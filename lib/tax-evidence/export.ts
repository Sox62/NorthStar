import { createZip } from "@/lib/reports/xlsx";
import type { StoredTransaction } from "@/lib/storage/types";
import type { EvidenceDocument } from "./types";
import type { TaxEvidenceReport } from "./report";
import { sourceHash } from "./sources";

type Cell = string | number | boolean | null | undefined;
export function evidenceCsv(rows: Cell[][]) {
  const cell = (value: Cell) => {
    let text = value == null ? "" : String(value);
    if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export function evidenceCsvFiles(report: TaxEvidenceReport) {
  return [
    { path: "Transactions.csv", data: evidenceCsv([
      ["row_id", "legal_owner", "account_ref", "account", "source", "source_transaction_id", "category", "date", "settlement_date", "original_source_date", "booked_date", "source_timezone", "currency", "net_amount", "gross_amount", "stored_fx_rate_to_aud", "fx_rate_evidence", "fees", "fee_currency", "taxes_source_amount", "description", "source_document_id", "source_sha256"],
      ...report.transactions.map((row) => [row.id, row.ownerType, row.accountRef, row.account, row.source, row.externalId, row.category, row.date, row.settlementDate, row.originalDate, row.bookedDate, row.timezone, row.currency, row.amount, row.grossAmount, row.fxRateToAud, row.fxRateEvidence, row.fee, row.feeCurrency, row.taxes, row.description, row.sourceId, row.sourceSha256]),
    ]) },
    { path: "FX_Conversions.csv", data: evidenceCsv([
      ["row_id", "date", "account", "from_currency", "from_amount", "to_currency", "to_amount", "to_per_from_rate", "rate_basis", "fee", "fee_currency", "source_document_id"],
      ...report.conversions.map((row) => [row.id, row.date, row.account, row.fromCurrency, row.fromAmount, row.toCurrency, row.toAmount, row.rate, row.rateBasis, row.fee, row.feeCurrency, row.sourceId]),
    ]) },
    { path: "Transfers_Reconciliation.csv", data: evidenceCsv([
      ["outgoing_row_id", "incoming_row_id", "from_account", "to_account", "withdrawal_date", "receipt_date", "currency", "withdrawal", "receipt", "difference", "review_status", "review_note"],
      ...report.transfers.map((row) => [row.outgoingId, row.incomingId, row.outgoingAccount, row.incomingAccount, row.outgoingDate, row.incomingDate, row.currency, row.outgoingAmount, row.incomingAmount, row.difference, row.status, row.note]),
    ]) },
    { path: "Account_Balances.csv", data: evidenceCsv([
      ["account", "currency", "opening_statement_balance", "recorded_net_movements", "closing_statement_balance", "variance", "missing_cash_amounts", "status", "source_documents"],
      ...report.balances.map((row) => [row.account, row.currency, row.opening, row.movement, row.closing, row.variance, row.missingMovements, row.status, row.balanceSources.join(";")]),
    ]) },
    { path: "Unmatched_Exceptions.csv", data: evidenceCsv([["code", "transaction_id", "detail"], ...report.exceptions.map((row) => [row.code, row.transactionId, row.detail])]) },
    { path: "Evidence_Index.csv", data: evidenceCsv([
      ["document_id", "legal_owner", "system", "account", "filename", "sha256", "period_start", "period_end", "imported_at", "sections"],
      ...report.sources.map((source) => [source.id, source.ownerType, source.system, source.account, source.filename, source.sha256, source.startDate, source.endDate, source.importedAt, source.metadata.sections?.join(";")]),
    ]) },
  ];
}

export function evidenceZip(report: TaxEvidenceReport, documents: EvidenceDocument[], canonicalTransactions: StoredTransaction[]) {
  const files: Array<{ path: string; data: string | Buffer }> = evidenceCsvFiles(report);
  const ids = new Set(report.sources.map((source) => source.id));
  for (const document of documents) {
    if (document.ownerType !== report.ownerType || !ids.has(document.id)) throw new Error("Document owner or source scope does not match the report.");
    const data = Buffer.from(document.contentBase64, "base64");
    if (sourceHash(data) !== document.sha256) throw new Error("A source document failed its stored checksum.");
    const name = document.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "source";
    files.push({ path: `Supporting_Documents/${document.system}/${document.id}-${name}`, data });
  }
  if (documents.length !== ids.size) throw new Error("A source document is unavailable. Retry after restoring the missing evidence.");
  const selectedIds = new Set(report.transactions.map((row) => row.id));
  files.push({ path: "Report.json", data: JSON.stringify(report, null, 2) });
  files.push({ path: "Canonical_Transactions.json", data: JSON.stringify(canonicalTransactions.filter((row) => row.ownerType === report.ownerType && selectedIds.has(row.id)), null, 2) });
  files.push({ path: "Review_History.json", data: JSON.stringify(report.reviews, null, 2) });
  files.push({ path: "README.md", data: `# SouthernStar tax evidence\n\n${report.ownerType} · ${report.period.label}\n\n${report.declaration}\n\nGenerated: ${report.generatedAt}\nReporting timezone: ${report.timezone}\nInclusive financial-year boundaries: ${report.period.startDate} – ${report.period.endDate}\nDate basis: ${report.dateBasis}\nInput fingerprint: ${report.inputHash}\nCalculation/export version: ${report.version}\n\nCash flows are not income totals. Transfer candidates are not confirmed matches. Same-currency transfers receive no automatic tax classification. Closing currency balances are not forex gains. Arithmetic agreement does not establish source completeness. Original supporting documents and the canonical snapshot contain unredacted private records for this legal owner.\n\nReview Unmatched_Exceptions.csv for missing evidence and incomplete balances. No exchange rate, opening balance, or tax treatment has been fabricated.\n` });
  const entries = files.map((file) => ({ path: file.path, sha256: sourceHash(file.data) }));
  files.push({ path: "Manifest.json", data: JSON.stringify({ version: report.version, ownerType: report.ownerType, period: report.period,
    timezone: report.timezone, generatedAt: report.generatedAt, inputHash: report.inputHash, missingEvidence: report.exceptions, sources: report.sources, entries }, null, 2) });
  return createZip(files, new Date(report.generatedAt));
}
