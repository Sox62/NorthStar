import { createHash } from "node:crypto";
import type { OwnerType } from "@/lib/storage/types";
import type { EvidenceDocument, EvidenceSourceInput } from "./types";

export function sourceHash(content: Buffer | string) {
  return createHash("sha256").update(content).digest("hex");
}

export function evidenceDocument(input: EvidenceSourceInput, ownerType: OwnerType, importedAt = new Date().toISOString()): EvidenceDocument {
  const content = Buffer.from(input.contentBase64, "base64");
  const sha256 = sourceHash(content);
  return { ...input, ownerType, sha256, importedAt, id: sourceHash(JSON.stringify([ownerType, input.system, input.accountKey, sha256])) };
}

export function evidenceRaw(raw: Record<string, unknown> | undefined, documents: EvidenceDocument[]) {
  const source = documents.find((item) => item.sha256 === raw?._sourceSha256);
  return { ...raw, ...(source ? { _evidenceSourceId: source.id, _importBatchId: source.id } : {}) };
}

/** Stable opaque account identity for joins; masks are presentation only. */
export function accountReference(system: string, account: string) {
  return sourceHash(JSON.stringify([system, account])).slice(0, 16);
}

export function displayAccount(system: string, account: string) {
  return `${system} · …${account.slice(-3)} (${accountReference(system, account).slice(0, 6)})`;
}
