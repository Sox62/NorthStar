import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { fetchIbkrOpenOrders, parseIbkrOrdersPayload, type IbkrOpenOrder } from "@/lib/integrations/ibkr-open-orders";
import { getStorage } from "@/lib/storage";
import type { StoredOpenOrder } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

function storedOrderToApi(order: StoredOpenOrder): IbkrOpenOrder {
  return {
    account: order.accountKey,
    orderId: order.orderId,
    conid: order.conid,
    symbol: order.symbol,
    companyName: order.name,
    side: order.side,
    status: order.status,
    orderType: order.orderType,
    timeInForce: order.timeInForce,
    currency: order.currency,
    totalQuantity: order.totalQuantity,
    filledQuantity: order.filledQuantity,
    remainingQuantity: order.remainingQuantity,
    limitPrice: order.limitPrice,
    stopPrice: order.stopPrice,
    averagePrice: order.averagePrice,
    description: order.description,
    lastExecutionTime: order.updatedAt ?? order.createdAt,
    raw: order.raw ?? {},
  };
}

async function storedFlexOpenOrders() {
  const fetchedAt = new Date().toISOString();
  const orders = await getStorage().listOpenOrders();
  return {
    configured: true,
    fetchedAt,
    accountId: null,
    baseUrl: "IBKR Flex",
    filters: "latest Flex open orders",
    orders: orders.map(storedOrderToApi),
    message: orders.length ? `${orders.length} IBKR Flex open order${orders.length === 1 ? "" : "s"}.` : "No IBKR open orders in the latest Flex sync.",
  };
}

export async function GET() {
  try {
    const result = await fetchIbkrOpenOrders();
    if (result.configured) return NextResponse.json(result);
    return NextResponse.json(await storedFlexOpenOrders());
  } catch (error) {
    try {
      return NextResponse.json(await storedFlexOpenOrders());
    } catch {
      return NextResponse.json(
        {
          configured: true,
          fetchedAt: new Date().toISOString(),
          accountId: null,
          baseUrl: null,
          filters: "",
          orders: [],
          message: error instanceof Error ? error.message : "Unable to fetch IBKR open orders.",
        },
        { status: 502 },
      );
    }
  }
}

const pasteSchema = z.object({
  text: z.string().min(1),
  ownerType: z.enum(["PERSONAL", "SMSF"]),
  accountKey: z.string().trim().max(32).optional(),
});

export async function POST(request: Request) {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(sessionCookie).catch(() => null))) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const input = pasteSchema.parse(await request.json());
    const parsed = parseIbkrOrdersPayload(input.text);
    const stored = parsed.map((order) => ({
      // The payload carries its own account when copied whole; fall back to what the user typed.
      accountKey: order.account || input.accountKey || "IBKR",
      orderId: order.orderId,
      conid: order.conid,
      symbol: order.symbol,
      name: order.companyName || order.symbol,
      exchange: "",
      currency: order.currency || "AUD",
      side: order.side,
      status: order.status,
      orderType: order.orderType,
      timeInForce: order.timeInForce,
      totalQuantity: order.totalQuantity,
      filledQuantity: order.filledQuantity,
      remainingQuantity: order.remainingQuantity,
      limitPrice: order.limitPrice,
      stopPrice: order.stopPrice,
      averagePrice: order.averagePrice,
      description: order.description,
      raw: order.raw,
    }));
    const count = await getStorage().replacePastedOpenOrders(input.ownerType, stored);
    return NextResponse.json({
      imported: count,
      symbols: [...new Set(parsed.map((order) => order.symbol).filter(Boolean))],
      message: `${count} open order${count === 1 ? "" : "s"} recorded for ${input.ownerType === "SMSF" ? "SMSF" : "Personal"}.`,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record open orders" }, { status: 400 });
  }
}
