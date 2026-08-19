export type IbkrOpenOrder = {
  account: string;
  orderId: string;
  conid: string;
  symbol: string;
  companyName: string;
  side: string;
  status: string;
  orderType: string;
  timeInForce: string;
  currency: string;
  totalQuantity: number | null;
  filledQuantity: number | null;
  remainingQuantity: number | null;
  limitPrice: number | null;
  stopPrice: number | null;
  averagePrice: number | null;
  description: string;
  lastExecutionTime: string | null;
  raw: Record<string, unknown>;
};

export type IbkrOpenOrdersResult = {
  configured: boolean;
  fetchedAt: string;
  accountId: string | null;
  baseUrl: string | null;
  filters: string;
  orders: IbkrOpenOrder[];
  message: string;
};

type IbkrOpenOrdersPayload = {
  orders?: Record<string, unknown>[];
  snapshot?: boolean;
  error?: string;
};

const DEFAULT_FILTERS = "submitted,pre_submitted,pending_submit,inactive";

const numberValue = (value: unknown): number | null => {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const stringValue = (value: unknown, fallback = "") => String(value ?? fallback).trim();

function config() {
  const baseUrl = (process.env.IBKR_CP_BASE_URL || process.env.IBKR_WEB_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const accountId = (process.env.IBKR_CP_ACCOUNT_ID || process.env.IBKR_WEB_API_ACCOUNT_ID || "").trim();
  const filters = (process.env.IBKR_CP_ORDER_FILTERS || DEFAULT_FILTERS).trim();
  const bearerToken = (process.env.IBKR_CP_BEARER_TOKEN || process.env.IBKR_WEB_API_BEARER_TOKEN || "").trim();
  const cookie = (process.env.IBKR_CP_COOKIE || "").trim();
  return { baseUrl, accountId, filters, bearerToken, cookie };
}

/** "Buy 5000 WGX" -> "WGX". Some payloads carry no ticker field at all. */
function symbolFromDescription(value: unknown) {
  const words = String(value ?? "").trim().split(/\s+/);
  const last = words[words.length - 1] ?? "";
  return /^[A-Z][A-Z0-9._-]{0,15}$/.test(last) ? last : "";
}

/** The tenor sits at the end of the description: "STP 1.760, GTC". */
function tifFromDescription(value: unknown) {
  const match = String(value ?? "").match(/\b(GTC|DAY|IOC|FOK|OPG)\b/i);
  return match ? match[1].toUpperCase() : "";
}

/** "STP 1.760, GTC" and "STP 8.400 LMT 8.500, GTC" carry the only price a stop order has. */
function priceFromDescription(value: unknown, keyword: "STP" | "LMT") {
  const match = String(value ?? "").match(new RegExp(`\\b${keyword}\\s+([0-9]*\\.?[0-9]+)`, "i"));
  return match ? numberValue(match[1]) : null;
}

export function normaliseIbkrOpenOrder(row: Record<string, unknown>): IbkrOpenOrder {
  const secondary = row.secondary_description ?? row.orderDesc;
  return {
    account: stringValue(row.acct ?? row.account),
    orderId: stringValue(row.orderId ?? row.order_id),
    conid: stringValue(row.conid ?? row.conidex),
    symbol: stringValue(row.ticker ?? row.symbol ?? row.description1) || symbolFromDescription(row.primary_description),
    companyName: stringValue(row.companyName ?? row.description1),
    side: stringValue(row.side).toUpperCase(),
    status: stringValue(row.status ?? row.order_status ?? row.order_ccp_status),
    orderType: stringValue(row.orderType ?? row.origOrderType ?? row.order_type),
    timeInForce: stringValue(row.timeInForce ?? row.tif) || tifFromDescription(secondary),
    currency: stringValue(row.cashCcy ?? row.currency),
    totalQuantity: numberValue(row.totalSize ?? row.quantity ?? row.size ?? row.total_shares_qty),
    filledQuantity: numberValue(row.filledQuantity ?? row.cum_shares_qty),
    remainingQuantity: numberValue(row.remainingQuantity ?? row.remaining_shares_qty),
    limitPrice: numberValue(row.price ?? row.limitPrice ?? row.limit_price) ?? priceFromDescription(secondary, "LMT"),
    stopPrice: numberValue(row.auxPrice ?? row.stopPrice ?? row.stop_price) ?? priceFromDescription(secondary, "STP"),
    averagePrice: numberValue(row.avgPrice ?? row.averagePrice),
    description: stringValue(row.orderDesc ?? row.description1 ?? row.primary_description ?? row.companyName),
    lastExecutionTime: stringValue(row.lastExecutionTime ?? row.lastExecutionTime_r) || null,
    raw: row,
  };
}

export async function fetchIbkrOpenOrders(): Promise<IbkrOpenOrdersResult> {
  const { baseUrl, accountId, filters, bearerToken, cookie } = config();
  const fetchedAt = new Date().toISOString();

  if (!baseUrl) {
    return {
      configured: false,
      fetchedAt,
      accountId: accountId || null,
      baseUrl: null,
      filters,
      orders: [],
      message: "IBKR Client Portal/Web API is not configured.",
    };
  }

  const url = new URL(`${baseUrl}/iserver/account/orders`);
  if (filters) url.searchParams.set("filters", filters);
  url.searchParams.set("force", "true");
  if (accountId) url.searchParams.set("accountId", accountId);

  const headers: Record<string, string> = { accept: "application/json" };
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  if (cookie) headers.cookie = cookie;

  const response = await fetch(url, { cache: "no-store", headers });
  const payload = await response.json().catch(() => ({})) as IbkrOpenOrdersPayload;
  if (!response.ok) {
    throw new Error(payload.error || `IBKR open orders request failed with status ${response.status}.`);
  }

  const orders = Array.isArray(payload.orders) ? payload.orders.map(normaliseIbkrOpenOrder) : [];
  return {
    configured: true,
    fetchedAt,
    accountId: accountId || null,
    baseUrl,
    filters,
    orders,
    message: orders.length ? `${orders.length} IBKR open order${orders.length === 1 ? "" : "s"}.` : "No matching IBKR open orders.",
  };
}

/**
 * Parses a pasted Client Portal order payload. Accepts the whole `{ "orders": [...] }` response
 * or a bare array, so it does not matter which the user copies. Rows are run through the same
 * normaliser the live feed uses, so a paste and a feed produce identical records.
 */
export function parseIbkrOrdersPayload(text: string): IbkrOpenOrder[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Paste the order payload from IBKR first.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("That is not valid JSON. Copy the whole response, including the outer braces.");
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { orders?: unknown }).orders)
      ? (parsed as { orders: unknown[] }).orders
      : null;
  if (!rows) throw new Error("No orders found. Expected an array, or an object with an \"orders\" array.");

  const orders = rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map(normaliseIbkrOpenOrder)
    // An order with no symbol and no id is not something we can show or reconcile later.
    .filter((order) => order.symbol || order.orderId);

  if (!orders.length) throw new Error("The payload parsed, but contained no recognisable orders.");
  return orders;
}
