import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { fundamentalsDraftSchema } from "./schema";
import type { FundamentalResearchDraftStatus } from "@/lib/storage";

export const runtime = "nodejs";

const statuses = new Set<FundamentalResearchDraftStatus>(["pending", "accepted", "rejected"]);

export async function GET(request: Request) {
  try {
    const rawStatus = new URL(request.url).searchParams.get("status") as FundamentalResearchDraftStatus | null;
    const status = rawStatus && statuses.has(rawStatus) ? rawStatus : undefined;
    return NextResponse.json({ drafts: await getStorage().listFundamentalResearchDrafts(status) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load fundamentals drafts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = fundamentalsDraftSchema.parse(await request.json());
    return NextResponse.json({ draft: await getStorage().createFundamentalResearchDraft(input) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid fundamentals draft" }, { status: 400 });
  }
}
