import type { OwnerType } from "@/lib/storage/types";

export type StopExit = {
  id: string;
  ownerType: OwnerType;
  broker: string;
  accountKey: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  exitDate: string;
  quantity: number;
  exitPrice: number;
  stopPrice: number | null;
  fees: number | null;
  feeCurrency: string | null;
  transactionId: string | null;
  transactionExternalId: string | null;
  orderId: string | null;
  source: "BROKER_REPORTED" | "USER_CONFIRMED" | "USER_RECORDED";
  notes: string;
  excluded: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type StopExitRevision = { id: string; ownerType: OwnerType; record: StopExit; recordedAt: string };
export type StopExitSale = Pick<StopExit, "id" | "ownerType" | "broker" | "accountKey" | "symbol" | "currency" | "exitDate" | "quantity" | "exitPrice"> & { transactionId: string };
export type StopExitHistory = { records: StopExit[]; sales: StopExitSale[] };
