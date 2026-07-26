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

export function normaliseIbkrOpenOrder(row: Record<string, unknown>): IbkrOpenOrder {
  return {
    account: stringValue(row.acct ?? row.account),
    orderId: stringValue(row.orderId ?? row.order_id),
    conid: stringValue(row.conid ?? row.conidex),
    symbol: stringValue(row.ticker ?? row.symbol ?? row.description1),
    companyName: stringValue(row.companyName ?? row.description1),
    side: stringValue(row.side).toUpperCase(),
    status: stringValue(row.status ?? row.order_status ?? row.order_ccp_status),
    orderType: stringValue(row.orderType ?? row.origOrderType),
    timeInForce: stringValue(row.timeInForce ?? row.tif),
    currency: stringValue(row.cashCcy ?? row.currency),
    totalQuantity: numberValue(row.totalSize ?? row.quantity ?? row.size),
    filledQuantity: numberValue(row.filledQuantity),
    remainingQuantity: numberValue(row.remainingQuantity),
    limitPrice: numberValue(row.price ?? row.limitPrice),
    stopPrice: numberValue(row.auxPrice ?? row.stopPrice),
    averagePrice: numberValue(row.avgPrice ?? row.averagePrice),
    description: stringValue(row.orderDesc ?? row.description1 ?? row.companyName),
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
