import { getStorage } from "@/lib/storage";
import { buildTaxEvidenceReport } from "@/lib/tax-evidence/report";
import { evidenceCsvFiles, evidenceZip } from "@/lib/tax-evidence/export";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope");
  const year = Number(params.get("year"));
  if ((scope !== "personal" && scope !== "smsf") || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return Response.json({ error: "Choose one legal owner (personal or smsf) and a financial year ending in YYYY." }, { status: 400 });
  }
  try {
    const owner = scope === "personal" ? "PERSONAL" : "SMSF";
    const storage = getStorage();
    const [transactions, sources, reviews] = await Promise.all([storage.listTransactions(owner), storage.listEvidenceSources(owner), storage.listEvidenceReviews(owner)]);
    const report = buildTaxEvidenceReport(owner, transactions, sources, reviews, year);
    const format = params.get("format");
    const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
    if (format === "zip") {
      const documents = await Promise.all(report.sources.map((source) => storage.getEvidenceDocument(source.id, owner)));
      if (documents.some((doc) => !doc)) throw new Error("An indexed source file is missing. Restore it before exporting.");
      const bytes = evidenceZip(report, documents.filter((doc) => doc != null), transactions);
      return new Response(new Uint8Array(bytes), { headers: { ...headers, "content-type": "application/zip", "content-disposition": `attachment; filename="SouthernStar_Tax_Evidence_FY${year}_${owner}.zip"` } });
    }
    if (format === "csv") return new Response(evidenceCsvFiles(report)[0].data, { headers: { ...headers, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="SouthernStar_Transactions_FY${year}_${owner}.csv"` } });
    if (format && format !== "json") return Response.json({ error: "Choose json, csv or zip." }, { status: 400 });
    return Response.json(report, { headers });
  } catch (error) {
    console.error("Tax evidence report failed:", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Unable to load tax evidence. Check the evidence migration and source-file availability." }, { status: 500 });
  }
}
