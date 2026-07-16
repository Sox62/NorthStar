import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { base64UrlToBytes } from "@/lib/auth/base64url";
import { clearSessionCookie, createSessionToken, sessionCookie } from "@/lib/auth/session";
import { getAuthStore } from "@/lib/auth/store";
import { requestOrigin, requestRpId } from "@/lib/auth/webauthn";

export const runtime = "nodejs";

const inputSchema = z.object({
  response: z.object({
    id: z.string().min(1),
  }).passthrough(),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const store = getAuthStore();
    const passkey = await store.getPasskey(input.response.id);
    if (!passkey) return NextResponse.json({ error: "Passkey is not registered for NorthStar." }, { status: 401 });

    let matchedChallengeId: string | null = null;
    const verification = await verifyAuthenticationResponse({
      response: input.response as unknown as AuthenticationResponseJSON,
      expectedChallenge: async (challenge) => {
        const stored = await store.getChallenge("authentication", challenge);
        matchedChallengeId = stored?.id ?? null;
        return Boolean(stored);
      },
      expectedOrigin: requestOrigin(request),
      expectedRPID: requestRpId(request),
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: base64UrlToBytes(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });
    if (!verification.verified || !matchedChallengeId) {
      return NextResponse.json({ error: "Passkey login could not be verified." }, { status: 401 });
    }

    await Promise.all([
      store.updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter),
      store.consumeChallenge(matchedChallengeId),
    ]);

    const response = NextResponse.json({ ok: true, username: passkey.username });
    response.headers.append("Set-Cookie", sessionCookie(await createSessionToken({ sub: passkey.userId, username: passkey.username })));
    return response;
  } catch (error) {
    const response = NextResponse.json({ error: error instanceof Error ? error.message : "Unable to verify passkey login." }, { status: 401 });
    response.headers.append("Set-Cookie", clearSessionCookie());
    return response;
  }
}
