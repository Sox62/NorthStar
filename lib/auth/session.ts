import { bytesToBase64Url, base64UrlToBytes } from "./base64url";

export const SESSION_COOKIE = "northstar_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionPayload = {
  sub: string;
  username: string;
  exp: number;
};

function sessionSecret() {
  return process.env.NORTH_STAR_SESSION_SECRET
    || process.env.AUTH_SECRET
    || process.env.NEXTAUTH_SECRET
    || process.env.NORTH_STAR_PASSWORD
    || "";
}

async function signingKey() {
  const secret = sessionSecret();
  if (!secret) throw new Error("NorthStar session secret is not configured.");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function encodeJson(payload: SessionPayload) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodeJson(value: string): SessionPayload | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as SessionPayload;
  } catch {
    return null;
  }
}

async function signatureFor(payload: string) {
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function secureEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % a.length] ?? 0) ^ (b[index % b.length] ?? 0);
  }
  return difference === 0;
}

export async function createSessionToken(input: { sub: string; username: string }) {
  const payload = encodeJson({
    ...input,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
  return `${payload}.${await signatureFor(payload)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = await signatureFor(payload);
  if (!await secureEqual(signature, expected)) return null;
  const decoded = decodeJson(payload);
  if (!decoded || decoded.exp < Math.floor(Date.now() / 1000)) return null;
  return decoded;
}

export function sessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS};${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${secure}`;
}
