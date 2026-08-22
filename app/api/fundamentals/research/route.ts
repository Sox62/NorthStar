import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { buildFundamentalResearchDraft, fetchResearchSource } from "@/lib/fundamentals/research-draft";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const researchRequestSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  name: z.preprocess((value) => value === "" || value === undefined ? null : value, z.string().trim().nullable()),
  sourceUrl: z.preprocess((value) => value === "" || value === undefined ? null : value, z.string().url().nullable()),
});

export async function POST(request: Request) {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(sessionCookie).catch(() => null);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const input = researchRequestSchema.parse(await request.json());
    const source = input.sourceUrl ? await fetchResearchSource(input.sourceUrl) : { text: "", title: null };
    const draftInput = buildFundamentalResearchDraft({
      symbol: input.symbol,
      name: input.name,
      sourceUrl: input.sourceUrl,
      sourceTitle: source.title,
      sourceText: source.text,
    });
    const draft = await getStorage().createFundamentalResearchDraft(draftInput);
    return NextResponse.json({ draft, message: `Created factual research draft for ${draft.symbol}.` }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create fundamentals research draft" },
      { status: 400 },
    );
  }
}
