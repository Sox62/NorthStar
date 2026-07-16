import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthStore } from "@/lib/auth/store";
import {
  configuredBootstrapUsername,
  passwordSchema,
  usernameSchema,
  verifyBootstrapPassword,
  verifyBootstrapPasswordOnly,
} from "@/lib/auth/webauthn";

export const runtime = "nodejs";

const inputSchema = z.object({
  username: usernameSchema.optional(),
  password: passwordSchema,
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

    const deleted = await getAuthStore().deletePasskeys(username);
    return NextResponse.json({ deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to remove passkeys." }, { status: 400 });
  }
}
