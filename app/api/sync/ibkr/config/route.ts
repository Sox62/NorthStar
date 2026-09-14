import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ibkrFlexConfigForOwner } from "@/lib/sync/ibkr-flex";
import type { OwnerType } from "@/lib/storage";

export const runtime = "nodejs";

function tail(value?: string) {
  if (!value) return null;
  return value.length <= 4 ? value : value.slice(-4);
}

function preview(value?: string) {
  if (!value) return null;
  return value.length <= 4 ? value : `${value.slice(0, 3)}...${tail(value)}`;
}

function fingerprint(value?: string) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
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
      queryIdPreview: preview(config.queryId),
      token: config.token ? "configured" : "missing",
      tokenEnvKey: config.tokenEnvKey ?? null,
      tokenFingerprint: fingerprint(config.token),
    } : null,
    tradeConfirmation: config?.tradeConfirmQueryId ? {
      envKey: config.tradeConfirmQueryEnvKey,
      queryIdTail: tail(config.tradeConfirmQueryId),
      queryIdPreview: preview(config.tradeConfirmQueryId),
    } : null,
  });
}
