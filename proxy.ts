import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { basicAuthEnabled } from "./lib/auth/policy";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth/session";

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
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

export async function proxy(request: NextRequest) {
  const expectedUsername = process.env.NORTH_STAR_USERNAME;
  const expectedPassword = process.env.NORTH_STAR_PASSWORD;
  const pathname = request.nextUrl.pathname;

  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  if (!expectedUsername || !expectedPassword) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("NorthStar authentication is not configured.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next();
  }

  if (pathname === "/api/sync") {
    const syncSecret = process.env.SYNC_SECRET;
    const supplied = request.headers.get("x-sync-key");
    if (syncSecret && supplied && await secureEqual(supplied, syncSecret)) return NextResponse.next();
  }

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (session) return NextResponse.next();

  const authorization = basicAuthEnabled() ? request.headers.get("authorization") : null;
  if (authorization?.startsWith("Basic ")) {
    try {
      const decoded = atob(authorization.slice(6));
      const separator = decoded.indexOf(":");
      if (separator >= 0) {
        const username = decoded.slice(0, separator);
        const password = decoded.slice(separator + 1);
        const [usernameMatches, passwordMatches] = await Promise.all([
          secureEqual(username, expectedUsername),
          secureEqual(password, expectedPassword),
        ]);

        if (usernameMatches && passwordMatches) return NextResponse.next();
      }
    } catch {
      // Fall through to the passkey login redirect/JSON 401 below.
    }
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icon-192x192.png|icon-512x512.png|apple-touch-icon.png).*)"],
};
