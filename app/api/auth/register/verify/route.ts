import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bytesToBase64Url } from "@/lib/auth/base64url";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";
import { getAuthStore } from "@/lib/auth/store";
import { configuredBootstrapUsername, requestOrigin, requestRpId, usernameSchema } from "@/lib/auth/webauthn";

export const runtime = "nodejs";

const inputSchema = z.object({
  username: usernameSchema.optional(),
  response: z.unknown(),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const store = getAuthStore();
    const username = input.username || configuredBootstrapUsername("Stephen");
    const user = await store.getUser(username);
    if (!user) return NextResponse.json({ error: "Passkey user was not found." }, { status: 404 });

    const challenge = await store.latestChallenge("registration", user.username);
    if (!challenge) return NextResponse.json({ error: "Passkey setup expired. Start again." }, { status: 400 });

    const verification = await verifyRegistrationResponse({
      response: input.response as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: requestOrigin(request),
      expectedRPID: requestRpId(request),
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Passkey setup could not be verified." }, { status: 400 });
    }

    const info = verification.registrationInfo;
    await store.savePasskey({
      id: info.credential.id,
      userId: user.id,
      publicKey: bytesToBase64Url(info.credential.publicKey),
      counter: info.credential.counter,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      transports: info.credential.transports ?? [],
    });
    await store.consumeChallenge(challenge.id);

    const response = NextResponse.json({ ok: true, username: user.username });
    response.headers.append("Set-Cookie", sessionCookie(await createSessionToken({ sub: user.id, username: user.username })));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to verify passkey setup." }, { status: 400 });
  }
}
