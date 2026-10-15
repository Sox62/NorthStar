import type { StoredTransaction } from "@/lib/storage/types";
import type { EvidenceReview } from "./types";

type CashRecord = Pick<StoredTransaction, "id" | "ownerType" | "broker" | "accountKey" | "currency" | "type" | "netCash">;
export function isTransferCash(row: Pick<StoredTransaction, "type" | "netCash">) { return ["CASH_ACTIVITY", "DEPOSIT", "WITHDRAWAL"].includes(row.type) && Number.isFinite(row.netCash); }

export function activeTransferReviews(reviews: EvidenceReview[]) {
  const active = new Map<string, EvidenceReview>();
  for (const review of reviews) {
    const key = `${review.outgoingId}|${review.incomingId}`;
    if (review.action === "match") active.set(key, review); else active.delete(key);
  }
  return [...active.values()];
}

export function validateTransferReview(input: Omit<EvidenceReview, "id" | "createdAt">, rows: CashRecord[], reviews: EvidenceReview[]) {
  const outgoing = rows.find((row) => row.id === input.outgoingId && row.ownerType === input.ownerType);
  const incoming = rows.find((row) => row.id === input.incomingId && row.ownerType === input.ownerType);
  if (!outgoing || !incoming || !isTransferCash(outgoing) || !isTransferCash(incoming)) throw new Error("Both cash records must belong to the selected legal owner.");
  if ((outgoing.netCash ?? 0) >= 0 || (incoming.netCash ?? 0) <= 0 || outgoing.currency !== incoming.currency
    || (outgoing.accountKey === incoming.accountKey && outgoing.broker === incoming.broker)) throw new Error("Match a withdrawal and receipt in the same currency in different accounts.");
  if (!input.note.trim()) throw new Error("Record the evidence or reason for this review, including any fees or timing differences.");
  const active = activeTransferReviews(reviews);
  if (input.action === "match" && active.some((review) => review.outgoingId === input.outgoingId || review.incomingId === input.incomingId)) throw new Error("A record is already matched. Undo that match before replacing it.");
  if (input.action === "unmatch" && !active.some((review) => review.outgoingId === input.outgoingId && review.incomingId === input.incomingId)) throw new Error("This pair has no active match.");
}
