import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ fundamental: await getStorage().acceptFundamentalResearchDraft(id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to accept fundamentals draft" }, { status: 400 });
  }
}
