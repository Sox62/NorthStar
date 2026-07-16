import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthStore } from "@/lib/auth/store";
import { requestRpId, usernameSchema } from "@/lib/auth/webauthn";

export const runtime = "nodejs";

const inputSchema = z.object({
  username: usernameSchema.optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = inputSchema.parse(body);
    const store = getAuthStore();
    const passkeys = await store.listPasskeys(input.username);
    if (!passkeys.length) {
      return NextResponse.json({ error: "No passkeys are registered yet." }, { status: 409 });
    }

    const options = await generateAuthenticationOptions({
      rpID: requestRpId(request),
      allowCredentials: passkeys.map((passkey) => ({ id: passkey.id, transports: passkey.transports })),
      userVerification: "required",
    });
    await store.saveChallenge("authentication", options.challenge, input.username ?? null);
    return NextResponse.json({ options });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start passkey login." }, { status: 400 });
  }
}
