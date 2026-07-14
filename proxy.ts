import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function challenge(message = "Authentication required") {
  return new NextResponse(message, {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="North Star", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

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

  if (!expectedUsername || !expectedPassword) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("North Star authentication is not configured.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next();
  }

  if (request.nextUrl.pathname === "/api/sync") {
    const syncSecret = process.env.SYNC_SECRET;
    const supplied = request.headers.get("x-sync-key");
    if (syncSecret && supplied && await secureEqual(supplied, syncSecret)) return NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return challenge();

  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return challenge();

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    const [usernameMatches, passwordMatches] = await Promise.all([
      secureEqual(username, expectedUsername),
      secureEqual(password, expectedPassword),
    ]);

    return usernameMatches && passwordMatches ? NextResponse.next() : challenge("Invalid credentials");
  } catch {
    return challenge("Invalid credentials");
  }
}

export const config = {
  matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico).*)"],
};
