import type { PoolClient } from "pg";
import type { ImportedTransaction } from "@/lib/integrations/types";
import type { EvidenceDocument, EvidenceReview, EvidenceSource } from "@/lib/tax-evidence/types";
import { evidenceRaw } from "@/lib/tax-evidence/sources";
import type { LocalStore, OwnerType } from "./types";

let localEvidenceQueue: Promise<unknown> = Promise.resolve();
export function serializedLocalEvidence<T>(work: () => Promise<T>): Promise<T> {
  const result = localEvidenceQueue.then(work);
  localEvidenceQueue = result.catch(() => undefined);
  return result;
}

function sameSourceDeclaration(existing: Pick<EvidenceSource, "startDate" | "endDate" | "metadata">, incoming: EvidenceDocument) {
  if (existing.startDate !== incoming.startDate || existing.endDate !== incoming.endDate
    || JSON.stringify(existing.metadata.balances ?? []) !== JSON.stringify(incoming.metadata.balances ?? [])) {
    throw new Error("This original file is already recorded with different coverage or balances. Review the existing declaration; it was not overwritten.");
  }
}

export function keepLocalEvidence(store: LocalStore, documents: EvidenceDocument[]) {
  store.evidenceDocuments ??= [];
  for (const document of documents) {
    const existing = store.evidenceDocuments.find((item) => item.id === document.id);
    if (existing) sameSourceDeclaration(existing, document); else store.evidenceDocuments.push(document);
  }
}

export function evidenceMetadata({ contentBase64: _content, ...source }: EvidenceDocument): EvidenceSource { return source; }

export async function keepPgEvidence(client: PoolClient, portfolioId: string, documents: EvidenceDocument[]) {
  for (const doc of documents) {
    const result = await client.query(`
    INSERT INTO tax_evidence_sources (id,portfolio_id,system,account_key,filename,media_type,sha256,content_base64,start_date,end_date,metadata,imported_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING
  `, [doc.id, portfolioId, doc.system, doc.accountKey, doc.filename, doc.mediaType, doc.sha256, doc.contentBase64, doc.startDate, doc.endDate, JSON.stringify(doc.metadata), doc.importedAt]);
    if (!result.rowCount) {
      const stored = await client.query(`SELECT start_date::text,end_date::text,metadata FROM tax_evidence_sources WHERE id=$1 AND portfolio_id=$2`, [doc.id, portfolioId]);
      if (!stored.rows[0]) throw new Error("Existing source document is unavailable.");
      sameSourceDeclaration({ startDate: stored.rows[0].start_date, endDate: stored.rows[0].end_date, metadata: stored.rows[0].metadata }, doc);
    }
  }
}

export function pgEvidence(row: Record<string, unknown>): EvidenceDocument {
  return {
    id: String(row.id), ownerType: row.legal_owner_type as OwnerType, system: row.system as EvidenceDocument["system"],
    accountKey: String(row.account_key), filename: String(row.filename), mediaType: String(row.media_type), sha256: String(row.sha256),
    contentBase64: String(row.content_base64 ?? ""), startDate: String(row.start_date), endDate: String(row.end_date),
    metadata: row.metadata as EvidenceDocument["metadata"], importedAt: new Date(String(row.imported_at)).toISOString(),
  };
}

export function pgReview(row: Record<string, unknown>): EvidenceReview {
  return { id: String(row.id), ownerType: row.legal_owner_type as OwnerType, outgoingId: String(row.outgoing_id), incomingId: String(row.incoming_id),
    action: row.action as EvidenceReview["action"], note: String(row.note), author: String(row.author), createdAt: new Date(String(row.created_at)).toISOString() };
}

/** Only evidence cash events may enter this path; it never rebuilds positions or changes cash/NAV. */
export function validateEvidenceTransactions(transactions: ImportedTransaction[]) {
  for (const row of transactions) {
    if (row.type !== "CASH_ACTIVITY" || !row.externalId || !/^\d{4}-\d{2}-\d{2}$/.test(row.tradeDate)
      || !Number.isFinite(row.netCash) || !/^[A-Z]{3}$/.test(row.currency)) throw new Error("Invalid evidence cash transaction.");
  }
}

export function sourceLinkedTransaction(transaction: ImportedTransaction, documents: EvidenceDocument[]) {
  return { ...transaction, raw: evidenceRaw(transaction.raw, documents) };
}

/** Link an identical historical row to a newly supplied original, preserving its original facts. */
export function linkExistingEvidence(stored: Record<string, unknown> | undefined, incoming: Record<string, unknown> | undefined) {
  if (!incoming?._evidenceSourceId) return stored;
  const primary = stored?._evidenceSourceId ?? incoming._evidenceSourceId;
  const existing = Array.isArray(stored?._evidenceSourceIds) ? stored._evidenceSourceIds : [];
  return { ...(stored ?? incoming), _evidenceSourceId: primary, _importBatchId: stored?._importBatchId ?? incoming._importBatchId,
    _evidenceSourceIds: [...new Set([...existing, primary, incoming._evidenceSourceId])] };
}
