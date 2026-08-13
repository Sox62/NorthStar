import { NextResponse } from "next/server";
import { z } from "zod";
import { ibkrFlexConfigForOwner } from "@/lib/sync/ibkr-flex";
import type { OwnerType } from "@/lib/storage";

export const runtime = "nodejs";

function tail(value?: string) {
  if (!value) return null;
  return value.length <= 4 ? value : value.slice(-4);
}

export async function GET(request: Request) {
  const owner = z.enum(["PERSONAL", "SMSF"]).parse((new URL(request.url).searchParams.get("owner") || "SMSF").toUpperCase()) as OwnerType;
  const config = ibkrFlexConfigForOwner(owner);
  return NextResponse.json({
    owner,
    configured: Boolean(config),
    label: config?.label ?? null,
    source: config?.source ?? null,
    activity: config ? {
      envKey: config.queryEnvKey,
      queryIdTail: tail(config.queryId),
      token: config.token ? "configured" : "missing",
    } : null,
    tradeConfirmation: config?.tradeConfirmQueryId ? {
      envKey: config.tradeConfirmQueryEnvKey,
      queryIdTail: tail(config.tradeConfirmQueryId),
    } : null,
  });
}
