import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const inputSchema = z.object({
  ownerType: z.enum(["PERSONAL", "SMSF"]),
  pensionPhase: z.boolean(),
});

export async function GET() {
  try {
    return NextResponse.json({ profiles: await getStorage().listTaxProfiles() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load tax profiles" },
      { status: 500 },
    );
  }
}

/**
 * Sets whether a legal book is in pension phase, which decides whether its capital gains are
 * taxable at all. It changes reported tax figures rather than any underlying record, so it is a
 * setting rather than an import, and the tax surfaces read it on every build.
 */
export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const profile = await getStorage().setTaxProfile(input.ownerType, input.pensionPhase);
    return NextResponse.json({
      profile,
      message: profile.pensionPhase
        ? `${profile.ownerType === "SMSF" ? "SMSF" : "Personal"} is in pension phase: capital gains are exempt current pension income.`
        : `${profile.ownerType === "SMSF" ? "SMSF" : "Personal"} is in accumulation phase: capital gains are taxable, with the discount where held over twelve months.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update tax profile" },
      { status: 400 },
    );
  }
}
