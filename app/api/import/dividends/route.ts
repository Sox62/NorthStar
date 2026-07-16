import { NextResponse } from "next/server";
import { parseDirectsharesDividendText, parseDividendCsv } from "@/lib/integrations/dividends";
import { getStorage, type OwnerType } from "@/lib/storage";
import type { ImportedTransaction } from "@/lib/integrations/types";

export const runtime = "nodejs";

const maskAccount = (account: string) => account.length <= 4 ? account : `${account.slice(0, 2)}••••${account.slice(-3)}`;

function ownerFromRequest(request: Request): OwnerType {
  const owner = (new URL(request.url).searchParams.get("owner") || "PERSONAL").toUpperCase();
  if (owner !== "SMSF" && owner !== "PERSONAL") throw new Error("Invalid portfolio owner.");
  return owner;
}

function parseDividendInput(body: string, contentType: string) {
  const text = body.trim();
  if (!text) throw new Error("Upload or paste a dividend CSV or Directshares dividend email.");
  if (contentType.includes("text/csv") || looksLikeCsv(text)) return parseDividendCsv(text);
  return [parseDirectsharesDividendText(text)];
}

function looksLikeCsv(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  return firstLine.includes(",") && /symbol|ticker|code|payment|dividend|amount/i.test(firstLine);
}

function summary(transactions: ImportedTransaction[]) {
  const account = transactions.find((transaction) => transaction.externalAccountId)?.externalAccountId || "DIVIDENDS";
  const dividends = transactions.filter((transaction) => transaction.type === "DIVIDEND").length;
  const netCash = transactions.reduce((sum, transaction) => sum + (transaction.netCash ?? 0), 0);
  const taxWithheld = transactions.reduce((sum, transaction) => sum + (transaction.taxes ?? 0), 0);
  const fees = transactions.reduce((sum, transaction) => sum + (transaction.fees ?? 0), 0);
  const symbols = [...new Set(transactions.map((transaction) => transaction.symbol))].join(", ");
  return { account: maskAccount(account), dividends, symbols, netCash, taxWithheld, fees };
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const commit = url.searchParams.get("commit") === "1";
    const owner = ownerFromRequest(request);
    const contentType = request.headers.get("content-type") || "";
    const transactions = parseDividendInput(await request.text(), contentType);

    const accounts = new Set(transactions.map((transaction) => transaction.externalAccountId || "DIVIDENDS"));
    if (accounts.size > 1) throw new Error("Upload one dividend account at a time.");

    if (!commit) {
      return NextResponse.json({
        preview: true,
        source: "Dividend payments",
        owner,
        ...summary(transactions),
      });
    }

    return NextResponse.json({
      preview: false,
      ...(await getStorage().importDirectsharesTransactions(transactions, owner, "Dividend Statements")),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid dividend import." }, { status: 400 });
  }
}
