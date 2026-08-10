import { NextResponse } from "next/server";
import { fetchIbkrOpenOrders, type IbkrOpenOrder } from "@/lib/integrations/ibkr-open-orders";
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
