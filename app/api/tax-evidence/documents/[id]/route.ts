import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const scope = new URL(request.url).searchParams.get("scope");
  if (scope !== "personal" && scope !== "smsf") return Response.json({ error: "Choose one legal owner." }, { status: 400 });
  const { id } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(id)) return Response.json({ error: "Document not found." }, { status: 404 });
  const document = await getStorage().getEvidenceDocument(id, scope === "personal" ? "PERSONAL" : "SMSF");
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
  const filename = document.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "source";
  return new Response(new Uint8Array(Buffer.from(document.contentBase64, "base64")), { headers: {
    "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store", "x-content-type-options": "nosniff",
  } });
}
