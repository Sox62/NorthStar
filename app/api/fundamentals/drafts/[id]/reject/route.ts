import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const rejectSchema = z.object({ reviewNotes: z.string().trim().nullable().optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = rejectSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ draft: await getStorage().rejectFundamentalResearchDraft(id, input.reviewNotes) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reject fundamentals draft" }, { status: 400 });
  }
}
