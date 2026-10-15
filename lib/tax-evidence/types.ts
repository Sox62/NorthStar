import type { ImportedTransaction } from "@/lib/integrations/types";
import type { OwnerType } from "@/lib/storage/types";

export type EvidenceSystem = "IBKR" | "Westpac" | "Macquarie" | "Artwork";
export type EvidenceBalance = { currency: string; startDate: string; endDate: string; opening: number | null; closing: number | null };
export type EvidenceSourceInput = {
  system: EvidenceSystem;
  accountKey: string;
  filename: string;
  mediaType: string;
  contentBase64: string;
  startDate: string;
  endDate: string;
  metadata: { sections?: string[]; balances?: EvidenceBalance[]; timezone?: string | null; [key: string]: unknown };
};
export type EvidenceSource = Omit<EvidenceSourceInput, "contentBase64"> & {
  id: string;
  ownerType: OwnerType;
  sha256: string;
  importedAt: string;
};
export type EvidenceDocument = EvidenceSource & { contentBase64: string };
export type EvidenceReview = {
  id: string;
  ownerType: OwnerType;
  outgoingId: string;
  incomingId: string;
  action: "match" | "unmatch";
  note: string;
  author: string;
  createdAt: string;
};
export type EvidenceImport = { source: EvidenceSourceInput; transactions: ImportedTransaction[] };
