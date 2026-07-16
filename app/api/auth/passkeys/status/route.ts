import { NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth/store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const passkeys = await getAuthStore().listPasskeys();
    return NextResponse.json({ registered: passkeys.length > 0, count: passkeys.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load passkey status" }, { status: 500 });
  }
}
