import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSessionCookie, createSessionToken, sessionCookie } from "@/lib/auth/session";
import { getAuthStore } from "@/lib/auth/store";
import { passwordSchema, usernameSchema, verifyBootstrapPassword } from "@/lib/auth/webauthn";

export const runtime = "nodejs";

const inputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    if (!await verifyBootstrapPassword(input.username, input.password)) {
      const response = NextResponse.json({ error: "Invalid NorthStar username or password." }, { status: 401 });
      response.headers.append("Set-Cookie", clearSessionCookie());
      return response;
    }

    const user = await getAuthStore().getOrCreateUser(input.username, input.username);
    const response = NextResponse.json({ ok: true, username: user.username });
    response.headers.append("Set-Cookie", sessionCookie(await createSessionToken({ sub: user.id, username: user.username })));
    return response;
  } catch (error) {
    const response = NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sign in with password." }, { status: 400 });
    response.headers.append("Set-Cookie", clearSessionCookie());
    return response;
  }
}
