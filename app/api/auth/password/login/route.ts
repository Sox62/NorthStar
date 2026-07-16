import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSessionCookie, createSessionToken, sessionCookie } from "@/lib/auth/session";
import { getAuthStore } from "@/lib/auth/store";
import { passwordSchema, requestOrigin, usernameSchema, verifyBootstrapPassword } from "@/lib/auth/webauthn";

export const runtime = "nodejs";

const inputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  next: z.string().optional(),
});

function safeNext(value: string | null | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function publicUrl(request: Request, path: string) {
  return new URL(path, requestOrigin(request));
}

function wantsHtml(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
}

function formString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : undefined;
}

async function parseInput(request: Request) {
  if (wantsHtml(request)) {
    const form = await request.formData();
    return inputSchema.parse({
      username: formString(form.get("username")),
      password: formString(form.get("password")),
      next: formString(form.get("next")),
    });
  }
  return inputSchema.parse(await request.json());
}

export async function POST(request: Request) {
  const htmlRequest = wantsHtml(request);
  try {
    const input = await parseInput(request);
    if (!await verifyBootstrapPassword(input.username, input.password)) {
      if (htmlRequest) {
        const redirectUrl = publicUrl(request, "/login");
        redirectUrl.searchParams.set("error", "invalid");
        redirectUrl.searchParams.set("username", input.username);
        const nextPath = safeNext(input.next);
        if (nextPath !== "/") redirectUrl.searchParams.set("next", nextPath);
        const response = NextResponse.redirect(redirectUrl, { status: 303 });
        response.headers.append("Set-Cookie", clearSessionCookie());
        return response;
      }
      const response = NextResponse.json({ error: "Invalid NorthStar username or password." }, { status: 401 });
      response.headers.append("Set-Cookie", clearSessionCookie());
      return response;
    }

    const user = await getAuthStore().getOrCreateUser(input.username, input.username);
    if (htmlRequest) {
      const response = NextResponse.redirect(publicUrl(request, safeNext(input.next)), { status: 303 });
      response.headers.append("Set-Cookie", sessionCookie(await createSessionToken({ sub: user.id, username: user.username })));
      return response;
    }
    const response = NextResponse.json({ ok: true, username: user.username });
    response.headers.append("Set-Cookie", sessionCookie(await createSessionToken({ sub: user.id, username: user.username })));
    return response;
  } catch (error) {
    if (htmlRequest) {
      const redirectUrl = publicUrl(request, "/login");
      redirectUrl.searchParams.set("error", "invalid");
      const response = NextResponse.redirect(redirectUrl, { status: 303 });
      response.headers.append("Set-Cookie", clearSessionCookie());
      return response;
    }
    const response = NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sign in with password." }, { status: 400 });
    response.headers.append("Set-Cookie", clearSessionCookie());
    return response;
  }
}
