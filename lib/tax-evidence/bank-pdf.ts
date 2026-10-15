import type { ImportedTransaction } from "@/lib/integrations/types";
import type { EvidenceImport } from "./types";
import { evidenceDate } from "./bank-csv";
import { sourceHash } from "./sources";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Input = { accountKey: string; currency: string; filename: string; startDate: string; endDate: string };

/** Only the text-based Westpac Account Activity format is supported; ambiguous layouts fail closed. */
export function parseWestpacActivityText(text: string, content: Buffer, input: Input): EvidenceImport {
  if (!/Westpac Banking Corporation/i.test(text) || !/Account activity/i.test(text)
    || !/Date\s+Description\s+Debit\s+Credit/.test(text)) throw new Error("This PDF is not a supported Westpac Account Activity report. Use its CSV export or attach a text-based Account Activity PDF.");
  const currencies: Array<[RegExp, string]> = [[/United States Dollars\s+Currency Account/i, "USD"], [/Australian Dollars\s+Currency Account/i, "AUD"], [/British Pounds?\s+Currency Account/i, "GBP"], [/Euros?\s+Currency Account/i, "EUR"], [/New Zealand Dollars\s+Currency Account/i, "NZD"], [/Canadian Dollars\s+Currency Account/i, "CAD"]];
  const currency = currencies.find(([pattern]) => pattern.test(text))?.[1];
  if (!currency || currency !== input.currency) throw new Error("The PDF account-currency heading must match the selected currency. The Available AUD tile is not used to infer transaction currency.");
  const blocks = text.split(/\bTransactions\s*\n/).slice(1);
  const body = blocks.map((block) => block.split(/Things you should know|--\s*\d+\s+of\s+\d+\s*--/i)[0]).join("\n");
  if (!body) throw new Error("No supported transaction table was found in the PDF.");
  const datePattern = "\\d{1,2}\\s+[A-Z][a-z]{2}\\s+\\d{4}";
  const starts = [...body.matchAll(new RegExp(`(?:^|\\n)\\s*(${datePattern})\\b`, "g"))];
  if (!starts.length) throw new Error("No dated transaction rows were found. Scanned PDFs require a CSV export.");
  if ([...text.matchAll(new RegExp(`(?:^|\\n)\\s*(${datePattern})\\b`, "g"))].length !== starts.length) throw new Error("Some dated PDF rows could not be read. Use the CSV export; no partial import was recorded.");
  const hash = sourceHash(content);
  const transactions = starts.map((match, index): ImportedTransaction => {
    const end = starts[index + 1]?.index ?? body.length;
    const original = body.slice(match.index!, end).trim();
    const [day, month, year] = match[1].split(/\s+/);
    const monthNumber = months.indexOf(month) + 1;
    const tradeDate = evidenceDate(`${year}-${String(monthNumber).padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (tradeDate < input.startDate || tradeDate > input.endDate) throw new Error(`PDF row ${index + 1} is outside the selected evidence period.`);
    const rest = original.slice(match[1].length).trim();
    const amounts = [...rest.matchAll(/-?\$[\d,]+\.\d{2}/g)];
    if (amounts.length !== 1 || !/-?\$[\d,]+\.\d{2}\s*$/.test(rest)) throw new Error(`PDF row ${index + 1} has an ambiguous amount. No rows were imported.`);
    const amount = Number(amounts[0][0].replace(/[$,]/g, ""));
    const description = rest.slice(0, amounts[0].index).replace(/\s+/g, " ").trim();
    if (!description || !Number.isFinite(amount) || (/(?:WITHDRAWAL|\bFEE\b)/i.test(description) && amount >= 0)) throw new Error(`PDF row ${index + 1} needs a clear signed debit/credit. No rows were imported.`);
    const reference = description.match(/(?:ONLINE|MOBILE|REFERENCE)\s+(\d+)/i)?.[1] ?? "";
    return { externalId: `BANK:${hash}:${index + 1}`, externalAccountId: input.accountKey, tradeDate,
      symbol: currency, exchange: "", description, type: "CASH_ACTIVITY", currency, netCash: amount, source: "Westpac Statement",
      raw: { _sourceSha256: hash, _originalDate: match[1], _originalPdfRow: original, _sourceIdQuality: "file_row", _bankReference: reference,
        _duplicateCandidateKey: sourceHash(JSON.stringify(["Westpac", input.accountKey, tradeDate, currency, amount, description, reference])),
        _evidenceCategory: /\bFEE\b/i.test(description) ? "Bank fee" : amount < 0 ? "Cash payment" : "Cash receipt" } };
  });
  const dates = transactions.map((row) => row.tradeDate).sort();
  return { transactions, source: { system: "Westpac", accountKey: input.accountKey, filename: input.filename, mediaType: "application/pdf", contentBase64: content.toString("base64"),
    startDate: dates[0], endDate: dates.at(-1)!, metadata: { sections: ["Bank transactions", "Westpac Account Activity PDF"], timezone: null,
      coverageBasis: "Observed transaction dates only; the activity report does not establish full statement coverage",
      balanceBasis: "No opening/closing statement balances inferred; Available AUD tile excluded", balances: [], parserVersion: "westpac-activity-v1" } } };
}

export async function parseWestpacActivityPdf(content: Buffer, input: Input) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: content });
  try {
    const result = await parser.getText();
    if (result.total > 50) throw new Error("Use an activity PDF with up to 50 pages, or import a CSV export.");
    return parseWestpacActivityText(result.text, content, input);
  } finally { await parser.destroy(); }
}
