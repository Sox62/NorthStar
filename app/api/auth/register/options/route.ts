import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { base64UrlToBytes } from "@/lib/auth/base64url";
import { getAuthStore } from "@/lib/auth/store";
import { passwordSchema, requestRpId, usernameSchema, verifyBootstrapPassword } from "@/lib/auth/webauthn";

export const runtime = "nodejs";

const inputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(128).optional(),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    if (!await verifyBootstrapPassword(input.username, input.password)) {
      return NextResponse.json({ error: "Invalid NorthStar username or password." }, { status: 401 });
    }

    const store = getAuthStore();
    const user = await store.getOrCreateUser(input.username, input.displayName ?? input.username);
    const existingPasskeys = await store.listPasskeys(input.username);
    const options = await generateRegistrationOptions({
      rpName: "NorthStar",
      rpID: requestRpId(request),
      userName: user.username,
      userDisplayName: user.displayName,
      userID: base64UrlToBytes(user.webauthnUserId),
      attestationType: "none",
      excludeCredentials: existingPasskeys.map((passkey) => ({ id: passkey.id, transports: passkey.transports })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });
    await store.saveChallenge("registration", options.challenge, user.username);
    return NextResponse.json({ options });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start passkey setup." }, { status: 400 });
  }
}
