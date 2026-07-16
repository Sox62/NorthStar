import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { base64UrlToBytes } from "@/lib/auth/base64url";
import { getAuthStore } from "@/lib/auth/store";
import {
  configuredBootstrapUsername,
  passwordSchema,
  requestRpId,
  usernameSchema,
  verifyBootstrapPassword,
  verifyBootstrapPasswordOnly,
} from "@/lib/auth/webauthn";

export const runtime = "nodejs";

const inputSchema = z.object({
  username: usernameSchema.optional(),
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(128).optional(),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const username = input.username || configuredBootstrapUsername("Stephen");
    const verified = input.username
      ? await verifyBootstrapPassword(input.username, input.password)
      : await verifyBootstrapPasswordOnly(input.password);
    if (!verified) {
      return NextResponse.json({ error: input.username ? "Invalid NorthStar username or password." : "Invalid NorthStar password." }, { status: 401 });
    }

    const store = getAuthStore();
    const user = await store.getOrCreateUser(username, input.displayName ?? username);
    const existingPasskeys = await store.listPasskeys(username);
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
      timeout: 60_000,
    });
    await store.saveChallenge("registration", options.challenge, user.username);
    return NextResponse.json({ options, username: user.username });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start passkey setup." }, { status: 400 });
  }
}
