import { NextResponse } from "next/server";
import { z } from "zod";
import { buildCapitalPolicySummary } from "@/lib/capital-policy";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const scopeSchema = z.enum(["personal", "smsf"]);

/**
 * Deployable cash, computed once here rather than in each caller. Raw cashValue overstates what
 * can actually be committed: it ignores the owner's liquidity floor and any resting buy orders,
 * which IBKR does not reserve against the balance.
 */
export async function GET(request: Request) {
  try {
    const scope = scopeSchema.parse((new URL(request.url).searchParams.get("scope") || "smsf").toLowerCase());
    const storage = getStorage();
    const [account, openOrders] = await Promise.all([storage.dashboard(scope), storage.listOpenOrders()]);
    return NextResponse.json({ summary: buildCapitalPolicySummary(account, openOrders) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load capital policy" }, { status: 400 });
  }
}
