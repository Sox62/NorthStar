import { z } from "zod";

export function requestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || new URL(request.url).protocol.replace(/:$/u, "");
  return `${protocol}://${host}`;
}

export function requestRpId(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
  return host.split(":")[0] || new URL(request.url).hostname;
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function secureEqual(left: string, right: string) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % a.length] ?? 0) ^ (b[index % b.length] ?? 0);
  }
  return difference === 0;
}

export async function verifyBootstrapPassword(username: string, password: string) {
  const expectedUsername = process.env.NORTH_STAR_USERNAME;
  const expectedPassword = process.env.NORTH_STAR_PASSWORD;
  if (!expectedUsername || !expectedPassword) return false;
  const [usernameOk, passwordOk] = await Promise.all([
    secureEqual(username, expectedUsername),
    secureEqual(password, expectedPassword),
  ]);
  return usernameOk && passwordOk;
}

export async function verifyBootstrapPasswordOnly(password: string) {
  const expectedPassword = process.env.NORTH_STAR_PASSWORD;
  if (!expectedPassword) return false;
  return secureEqual(password, expectedPassword);
}

export function configuredBootstrapUsername(fallback = "NorthStar") {
  return process.env.NORTH_STAR_USERNAME || fallback;
}

export const usernameSchema = z.string().trim().min(1).max(128);
export const passwordSchema = z.string().min(1).max(512);
