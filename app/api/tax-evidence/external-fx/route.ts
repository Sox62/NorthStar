import { getStorage, type OwnerType } from "@/lib/storage";
import { evidenceDocument, sourceHash } from "@/lib/tax-evidence/sources";
import { externalFxImport, readExternalFx, validateExternalFunding } from "@/lib/tax-evidence/external-fx";
import type { EvidenceSourceInput } from "@/lib/tax-evidence/types";

export const runtime = "nodejs";
const maxBytes = 10 * 1024 * 1024;
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > maxBytes + 65536) return Response.json({ error: "Use supporting files totalling up to 10 MB." }, { status: 413 });
    const form = await request.formData();
    const owner = String(form.get("owner"));
    if (owner !== "PERSONAL" && owner !== "SMSF") throw new Error("Choose one legal owner.");
    const accountKey = String(form.get("account") ?? "").trim();
    if (!accountKey || accountKey.length > 128) throw new Error("Supply a stable private provider-account label (up to 128 characters).");
    const row = readExternalFx(Object.fromEntries(form.entries()), process.env.NORTH_STAR_USERNAME || "Local user");
    const storage = getStorage();
    const transactions = await storage.listTransactions(owner);
    const funding = validateExternalFunding(row, transactions, owner);
    const existing = await storage.listEvidenceSources(owner);
    const files = form.getAll("support").filter((file): file is File => file instanceof File && file.size > 0);
    if (files.length > 10 || files.reduce((sum, file) => sum + file.size, 0) > maxBytes) throw new Error("Attach up to 10 supporting files totalling up to 10 MB.");
    if (row.evidenceBasis === "provider_confirmation" && (!files.length || !row.conversionDate)) throw new Error("A provider-confirmation entry needs an original supporting file and the exact conversion date.");
    const sourceIds: string[] = [];
    const fundingSourceId = funding?.raw?._evidenceSourceId;
    if (typeof fundingSourceId === "string" && existing.some((source) => source.id === fundingSourceId)) sourceIds.push(fundingSourceId);
    const additionalSources: EvidenceSourceInput[] = [];
    for (const file of files) {
      if (!/\.(pdf|txt|csv|xml|json|png|jpe?g)$/i.test(file.name)) throw new Error("Use PDF, TXT, CSV, XML, JSON, PNG or JPG supporting files.");
      const content = Buffer.from(await file.arrayBuffer());
      const previous = existing.find((source) => source.system === "External FX" && source.accountKey === accountKey && source.sha256 === sourceHash(content));
      if (previous) { sourceIds.push(previous.id); continue; }
      const source: EvidenceSourceInput = { system: "External FX", accountKey, filename: file.name, mediaType: file.type || "application/octet-stream", contentBase64: content.toString("base64"),
        startDate: `${row.month}-01`, endDate: externalFxImport(row, accountKey, []).source.endDate,
        metadata: { sections: ["External FX supporting document"], timezone: null, coverageBasis: "Attached to a reported activity month; document coverage not independently established" } };
      sourceIds.push(evidenceDocument(source, owner).id); additionalSources.push(source);
    }
    const input = externalFxImport(row, accountKey, sourceIds, additionalSources);
    const result = await storage.importTaxEvidence(input, owner as OwnerType);
    return Response.json({ ...result, recorded: true, amountImpliedRate: row.toAmount / row.fromAmount,
      note: "External FX evidence recorded. Bank transactions and portfolio balances were not duplicated or changed." }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to record external FX evidence." }, { status: 400 }); }
}
