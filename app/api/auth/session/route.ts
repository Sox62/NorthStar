import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie?.slice(SESSION_COOKIE.length + 1);
  const session = await verifySessionToken(token);
  return NextResponse.json({ authenticated: Boolean(session), username: session?.username ?? null });
}
