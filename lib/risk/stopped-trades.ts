import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { ownerForScope } from "@/lib/core/accounting";
import type { Scope, StorageAdapter, StoredTransaction } from "@/lib/storage";
import type { StopExit, StopExitHistory, StopExitRevision } from "./stopped-trades-types";

const stopOrderTypes = new Set(["STP", "STPLMT", "STPPROT", "STOP", "STOPLIMIT", "TRAIL", "TRAILLMT", "TRAILINGSTOP", "TRAILINGSTOPLIMIT"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}, "Use a valid exit date.").refine(value => value <= new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), "An executed exit cannot be future-dated.");
const optionalPrice = z.number().finite().positive().nullable().optional();
const notes = z.string().trim().max(2000).default("");
export const stopExitInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("sale"), transactionId: z.string().min(1).max(200), stopPrice: optionalPrice, notes }),
  z.object({ mode: z.literal("manual"), id: z.string().uuid(), ownerType: z.enum(["PERSONAL", "SMSF"]),
    broker: z.string().trim().min(1).max(80), accountKey: z.string().trim().min(1).max(100),
    symbol: z.string().trim().min(1).max(40), name: z.string().trim().max(200).default(""), exchange: z.string().trim().max(30).default(""),
    currency: z.string().trim().regex(/^[A-Z]{3}$/), exitDate: dateSchema,
    quantity: z.number().finite().positive(), exitPrice: z.number().finite().positive(), stopPrice: optionalPrice,
    fees: z.number().finite().nonnegative().nullable().optional(), notes }),
]);

function rawValue(transaction: StoredTransaction, ...keys: string[]) {
  const raw = transaction.raw ?? {};
  const normalized = new Map(Object.entries(raw).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), value]));
  for (const key of keys) {
    const value = normalized.get(key.toLowerCase());
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function cancelled(transaction: StoredTransaction) {
  return /^(Y|YES|TRUE|1)$/i.test(rawValue(transaction, "isCancelled", "isCanceled"))
    || /CANCEL|BUST|REVERSE|REJECT/i.test(rawValue(transaction, "status", "transactionType"))
    || Boolean(rawValue(transaction, "originalTradeID"));
}

export function executedSale(transaction: StoredTransaction) {
  return transaction.type === "SELL" && Boolean(transaction.symbol) && Number.isFinite(transaction.quantity)
    && Math.abs(transaction.quantity ?? 0) > 0 && Number.isFinite(transaction.price) && (transaction.price ?? 0) > 0
    && dateSchema.safeParse(transaction.tradeDate).success && !cancelled(transaction);
}

export function brokerReportsStopExit(transaction: StoredTransaction) {
  const type = rawValue(transaction, "orderType").toUpperCase().replace(/[\s_-]/g, "");
  const close = rawValue(transaction, "openCloseIndicator", "openClose").toUpperCase();
  return transaction.broker.toUpperCase() === "IBKR" && executedSale(transaction)
    && stopOrderTypes.has(type) && (close === "C" || close === "CLOSE" || close === "CLOSING");
}

export function stopExitId(transaction: StoredTransaction) {
  return `sale-${createHash("sha256").update(JSON.stringify([
    transaction.ownerType, transaction.broker.toUpperCase(), transaction.accountKey, transaction.externalId,
  ])).digest("hex")}`;
}

export function exitFromSale(transaction: StoredTransaction, now: string | null = null): StopExit {
  const rawStop = Number(rawValue(transaction, "stopPrice", "auxPrice"));
  return {
    id: stopExitId(transaction), ownerType: transaction.ownerType, broker: transaction.broker, accountKey: transaction.accountKey,
    symbol: transaction.symbol, name: transaction.description || transaction.symbol, exchange: transaction.exchange,
    currency: transaction.currency, exitDate: transaction.tradeDate, quantity: Math.abs(transaction.quantity!), exitPrice: transaction.price!,
    stopPrice: Number.isFinite(rawStop) && rawStop > 0 ? rawStop : null,
    fees: transaction.fees != null && Number.isFinite(transaction.fees) ? Math.abs(transaction.fees) : null,
    feeCurrency: rawValue(transaction, "feeCurrency", "ibCommissionCurrency", "commissionCurrency") || transaction.currency,
    transactionId: transaction.id, transactionExternalId: transaction.externalId,
    orderId: rawValue(transaction, "ibOrderID", "orderID", "brokerageOrderID") || null,
    source: brokerReportsStopExit(transaction) ? "BROKER_REPORTED" : "USER_CONFIRMED",
    notes: "", excluded: false, createdAt: now, updatedAt: now,
  };
}

export function combineStopExitHistory(transactions: StoredTransaction[], revisions: StopExitRevision[], ownerType?: StopExit["ownerType"]): StopExitHistory {
  const scoped = transactions.filter(t => !ownerType || t.ownerType === ownerType);
  const records = new Map<string, StopExit>();
  for (const transaction of scoped.filter(brokerReportsStopExit)) records.set(stopExitId(transaction), exitFromSale(transaction));
  // Storage returns append order; timestamps can tie during rapid corrections.
  for (const revision of revisions) {
    if (ownerType && revision.ownerType !== ownerType) continue;
    if (revision.record.ownerType !== revision.ownerType) throw new Error("Stopped-out history owner mismatch.");
    records.set(revision.record.id, revision.record);
  }
  return {
    records: [...records.values()].sort((a, b) => b.exitDate.localeCompare(a.exitDate) || a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id)),
    sales: scoped.filter(executedSale).sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)).map(t => ({
      id: stopExitId(t), transactionId: t.id, ownerType: t.ownerType, broker: t.broker, accountKey: t.accountKey,
      symbol: t.symbol, currency: t.currency, exitDate: t.tradeDate, quantity: Math.abs(t.quantity!), exitPrice: t.price!,
    })),
  };
}

export async function stoppedTradeHistory(storage: StorageAdapter, scope: Scope): Promise<StopExitHistory> {
  const owner = ownerForScope(scope);
  const [transactions, revisions] = await Promise.all([storage.listTransactions(owner), storage.listStopExitRevisions(owner)]);
  return combineStopExitHistory(transactions, revisions, owner);
}

export async function recordStopExit(storage: StorageAdapter, value: unknown) {
  const input = stopExitInput.parse(value);
  const now = new Date().toISOString();
  let record: StopExit;
  if (input.mode === "sale") {
    const transaction = (await storage.listTransactions()).find(t => t.id === input.transactionId);
    if (!transaction || !executedSale(transaction)) throw new Error("Choose an executed sale with a recorded quantity and fill price.");
    record = { ...exitFromSale(transaction, now), notes: input.notes, stopPrice: input.stopPrice ?? exitFromSale(transaction, now).stopPrice };
  } else {
    const { mode: _mode, ...facts } = input;
    record = { ...facts, symbol: input.symbol.toUpperCase(), name: input.name || input.symbol.toUpperCase(),
      stopPrice: input.stopPrice ?? null, fees: input.fees ?? null, feeCurrency: input.currency,
      transactionId: null, transactionExternalId: null, orderId: null, source: "USER_RECORDED", excluded: false,
      createdAt: now, updatedAt: now };
  }
  const existing = (await stoppedTradeHistory(storage, record.ownerType === "PERSONAL" ? "personal" : "smsf")).records.find(r => r.id === record.id);
  if (existing) record.createdAt = existing.createdAt ?? now;
  if (existing && input.mode === "manual") {
    if (!isDeepStrictEqual({ ...record, createdAt: "", updatedAt: "" }, { ...existing, createdAt: "", updatedAt: "" })) throw new Error("This record already exists. Start a new entry for a different exit.");
    return existing;
  }
  await storage.appendStopExitRevision({ id: randomUUID(), ownerType: record.ownerType, record, recordedAt: now });
  return record;
}

export async function setStopExitExcluded(storage: StorageAdapter, id: string, excluded: boolean) {
  const history = await stoppedTradeHistory(storage, "overall");
  const record = history.records.find(row => row.id === id);
  if (!record) throw new Error("Stopped-out trade not found.");
  const now = new Date().toISOString();
  const updated = { ...record, excluded, createdAt: record.createdAt ?? now, updatedAt: now };
  await storage.appendStopExitRevision({ id: randomUUID(), ownerType: record.ownerType, record: updated, recordedAt: updated.updatedAt });
  return updated;
}

export function stopExitsCsv(records: StopExit[]) {
  function cell(value: string | number | null) {
    let text = value == null ? "" : String(value);
    if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }
  return [
    ["Exit date", "Symbol", "Name", "Owner", "Broker", "Account", "Currency", "Quantity", "Fill price", "Stop level", "Fees", "Fee currency", "Evidence", "Trade reference", "Order reference", "Notes"],
    ...records.filter(r => !r.excluded).map(r => [r.exitDate, r.symbol, r.name, r.ownerType, r.broker, r.accountKey, r.currency, r.quantity, r.exitPrice, r.stopPrice, r.fees, r.feeCurrency, r.source, r.transactionExternalId, r.orderId, r.notes]),
  ].map(row => row.map(cell).join(",")).join("\r\n");
}
