import { parseIbkrFlexXml } from "@/lib/integrations/ibkr";
import { getStorage, type OwnerType } from "@/lib/storage";
import { evidenceDate, parseBankEvidenceCsv } from "@/lib/tax-evidence/bank-csv";
import type { EvidenceImport } from "@/lib/tax-evidence/types";

export const runtime = "nodejs";
const maxBytes = 10 * 1024 * 1024;
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > maxBytes + 65536) return Response.json({ error: "Use files smaller than 10 MB." }, { status: 413 });
    const form = await request.formData();
    const owner = String(form.get("owner"));
    const system = String(form.get("system"));
    if (owner !== "PERSONAL" && owner !== "SMSF") throw new Error("Choose one legal owner.");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > maxBytes) throw new Error("Choose a non-empty file up to 10 MB.");
    const content = Buffer.from(await file.arrayBuffer());
    const commit = new URL(request.url).searchParams.get("commit") === "1";
    const storage = getStorage();
    if (system === "IBKR") {
      const report = parseIbkrFlexXml(content.toString("utf8"));
      for (const source of report.sourceDocuments ?? []) { source.filename = file.name; source.contentBase64 = content.toString("base64"); }
      if (!commit) return Response.json({ preview: true, transactions: report.transactions.length, conversions: report.transactions.filter((row) => row.type === "FX").length,
        cashMovements: report.transactions.filter((row) => row.type === "CASH_ACTIVITY").length, from: report.fromDate, to: report.toDate,
        note: "Records original XML and transactions without refreshing portfolio positions, cash balances or valuation snapshots." });
      return Response.json({ preview: false, ...(await storage.importIbkr(report, owner, { evidenceOnly: true })) });
    }
    const startDate = evidenceDate(String(form.get("from") ?? ""));
    const endDate = evidenceDate(String(form.get("to") ?? ""));
    if (startDate > endDate) throw new Error("Statement start must not be later than its end.");
    const accountKey = String(form.get("account") ?? "").trim();
    if (!accountKey || accountKey.length > 128) throw new Error("Supply a stable account identifier (up to 128 characters).");
    let input: EvidenceImport;
    if (system === "Westpac" || system === "Macquarie") {
      const currency = String(form.get("currency") ?? "").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Supply the account's three-letter currency.");
      const optionalAmount = (key: string) => {
        const value = String(form.get(key) ?? "").trim();
        if (!value) return null;
        if (!Number.isFinite(Number(value))) throw new Error("Opening and closing balances must be numbers or blank.");
        return Number(value);
      };
      input = parseBankEvidenceCsv(content, { system, accountKey, currency, filename: file.name, startDate, endDate, opening: optionalAmount("opening"), closing: optionalAmount("closing") });
    } else if (system === "Artwork") {
      if (!/\.(pdf|txt|csv|xml)$/i.test(file.name)) throw new Error("Attach artwork evidence as PDF, TXT, CSV or XML.");
      input = { transactions: [], source: { system, accountKey, filename: file.name, mediaType: "application/octet-stream", contentBase64: content.toString("base64"),
        startDate, endDate, metadata: { sections: ["Supporting artwork document"], timezone: null } } };
    } else throw new Error("Choose IBKR, Westpac, Macquarie or Artwork.");
    if (!commit) return Response.json({ preview: true, transactions: input.transactions.length, from: startDate, to: endDate, note: "Cash evidence and the original file will be retained. Portfolio balances and positions are not updated by this import." });
    return Response.json({ preview: false, ...(await storage.importTaxEvidence(input, owner as OwnerType)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to import evidence." }, { status: 400 });
  }
}
