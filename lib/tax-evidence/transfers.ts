import type { StoredTransaction } from "@/lib/storage/types";
import type { EvidenceReview, EvidenceSource } from "./types";
import { readExternalFx, validateExternalFunding } from "./external-fx";

type CashRecord = Pick<StoredTransaction, "id" | "ownerType" | "broker" | "accountKey" | "currency" | "type" | "netCash">;
export function isTransferCash(row: Pick<StoredTransaction, "type" | "netCash">) { return ["CASH_ACTIVITY", "DEPOSIT", "WITHDRAWAL"].includes(row.type) && Number.isFinite(row.netCash); }

export function activeEvidenceReviews(reviews: EvidenceReview[]) {
  const active = new Map<string, EvidenceReview>();
  for (const review of reviews) {
    const key = `${review.outgoingId}|${review.incomingId}`;
    if (review.action === "match") active.set(key, review); else active.delete(key);
  }
  return [...active.values()];
}

export function activeTransferReviews(reviews: EvidenceReview[]) {
  return activeEvidenceReviews(reviews).filter((review) => !review.externalFxId);
}

// Keep the existing append-only review table. The envelope distinguishes FX receipt links
// from ordinary same-currency transfers without changing their validation or source facts.
const reviewPrefix = "SS-EVIDENCE-REVIEW-V1:";
export function encodeReviewNote(input: Pick<EvidenceReview, "note" | "externalFxId">) {
  return reviewPrefix + JSON.stringify({ note: input.note, ...(input.externalFxId ? { externalFxId: input.externalFxId } : {}) });
}
export function decodeReviewNote(value: unknown): Pick<EvidenceReview, "note" | "externalFxId"> {
  const note = String(value);
  if (note.startsWith(reviewPrefix)) {
    try {
      const data = JSON.parse(note.slice(reviewPrefix.length));
      if (typeof data.note === "string" && (data.externalFxId == null || (typeof data.externalFxId === "string" && /^[a-f0-9]{64}$/.test(data.externalFxId))))
        return { note: data.note, ...(data.externalFxId ? { externalFxId: data.externalFxId } : {}) };
    } catch { /* Historical free text remains readable. */ }
  }
  return { note };
}

export function validateTransferReview(input: Omit<EvidenceReview, "id" | "createdAt">, rows: CashRecord[], reviews: EvidenceReview[], sources: EvidenceSource[] = []) {
  const outgoing = rows.find((row) => row.id === input.outgoingId && row.ownerType === input.ownerType);
  const incoming = rows.find((row) => row.id === input.incomingId && row.ownerType === input.ownerType);
  if (!outgoing || !incoming || !isTransferCash(outgoing) || !isTransferCash(incoming)) throw new Error("Both cash records must belong to the selected legal owner.");
  if (input.externalFxId) {
    const source = sources.find((row) => row.id === input.externalFxId && row.ownerType === input.ownerType && row.system === "External FX");
    if (!source?.metadata.externalFx) throw new Error("Choose an external FX declaration belonging to this legal owner.");
    const declaration = readExternalFx(source.metadata.externalFx as unknown as Record<string, unknown>, source.metadata.externalFx.author);
    if (declaration.fundingTransactionId !== outgoing.id) throw new Error("The withdrawal must be the declaration's recorded funding transaction.");
    validateExternalFunding(declaration, rows, input.ownerType);
    if ((incoming.netCash ?? 0) <= 0 || incoming.currency !== declaration.toCurrency || Math.abs(incoming.netCash! - declaration.toAmount) > 0.005)
      throw new Error("The receiving credit must match the FX payout currency and amount.");
  } else if ((outgoing.netCash ?? 0) >= 0 || (incoming.netCash ?? 0) <= 0 || outgoing.currency !== incoming.currency
    || (outgoing.accountKey === incoming.accountKey && outgoing.broker === incoming.broker)) throw new Error("Match a withdrawal and receipt in the same currency in different accounts.");
  if (!input.note.trim()) throw new Error("Record the evidence or reason for this review, including any fees or timing differences.");
  const active = activeEvidenceReviews(reviews);
  if (input.action === "match" && active.some((review) => review.outgoingId === input.outgoingId || review.incomingId === input.incomingId)) throw new Error("A record is already matched. Undo that match before replacing it.");
  if (input.action === "unmatch" && !active.some((review) => review.outgoingId === input.outgoingId && review.incomingId === input.incomingId && review.externalFxId === input.externalFxId)) throw new Error("This pair has no active match.");
}
