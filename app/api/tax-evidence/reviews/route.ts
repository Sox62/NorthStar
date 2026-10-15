import { z } from "zod";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
const schema = z.object({ ownerType: z.enum(["PERSONAL", "SMSF"]), outgoingId: z.string().uuid(), incomingId: z.string().uuid(),
  action: z.enum(["match", "unmatch"]), note: z.string().trim().min(1).max(2000) });
export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const review = await getStorage().recordEvidenceReview({ ...input, author: process.env.NORTH_STAR_USERNAME || "Local user" });
    return Response.json({ review }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save review." }, { status: 400 }); }
}
