import { NextResponse } from "next/server";
import { fetchIbkrOpenOrders } from "@/lib/integrations/ibkr-open-orders";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const result = await fetchIbkrOpenOrders();
    return NextResponse.json(result);
  } catch (error) {
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
