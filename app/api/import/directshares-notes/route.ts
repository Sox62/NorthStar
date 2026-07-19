import { NextResponse } from "next/server";
import {
  parseDirectsharesConfirmationCsv,
  parseDirectsharesConfirmationPdf,
  parseDirectsharesConfirmationText,
} from "@/lib/integrations/directshares";
import { getStorage, type ImportResult, type OwnerType } from "@/lib/storage";
import type { ImportedTransaction } from "@/lib/integrations/types";

export const runtime = "nodejs";

const maskAccount = (account: string) => account.length <= 4 ? account : `${account.slice(0, 2)}••••${account.slice(-3)}`;

function ownerFromRequest(request: Request): OwnerType {
  const owner = (new URL(request.url).searchParams.get("owner") || "PERSONAL").toUpperCase();
  if (owner !== "SMSF" && owner !== "PERSONAL") throw new Error("Invalid portfolio owner.");
  return owner;
}

function summary(transactions: ImportedTransaction[]) {
  const accountGroups = groupByAccount(transactions);
  const buys = transactions.filter((transaction) => transaction.type === "BUY").length;
  const sells = transactions.filter((transaction) => transaction.type === "SELL").length;
  const netCash = transactions.reduce((sum, transaction) => sum + (transaction.netCash ?? 0), 0);
  const fees = transactions.reduce((sum, transaction) => sum + (transaction.fees ?? 0), 0);
  const grossConsideration = transactions.reduce((sum, transaction) => sum + Math.abs(transaction.cost ?? 0), 0);
  return {
    accountCount: accountGroups.length,
    accounts: accountGroups.map(([account, rows]) => `${maskAccount(account)} (${rows.length})`),
    trades: transactions.length,
    buys,
    sells,
    grossConsideration,
    netCash,
    fees,
  };
}

function groupByAccount(transactions: ImportedTransaction[]) {
  const groups = new Map<string, ImportedTransaction[]>();
  for (const transaction of transactions) {
    const account = transaction.externalAccountId || "DIRECTSHARES";
    groups.set(account, [...(groups.get(account) ?? []), transaction]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function isCsv(contentType: string, filename = "") {
  return contentType.includes("text/csv")
    || contentType.includes("application/csv")
    || filename.toLowerCase().endsWith(".csv");
}

async function transactionsFromForm(request: Request) {
  const form = await request.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!files.length) throw new Error("Upload at least one Directshares confirmation PDF or text file.");

  const transactions: ImportedTransaction[] = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const lowerName = file.name.toLowerCase();
    if (isCsv(file.type, lowerName)) {
      transactions.push(...parseDirectsharesConfirmationCsv(bytes.toString("utf8")));
    } else if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
      transactions.push(await parseDirectsharesConfirmationPdf(bytes));
    } else {
      transactions.push(parseDirectsharesConfirmationText(bytes.toString("utf8")));
    }
  }
  return transactions;
}

async function transactionsFromBody(request: Request) {
  const bytes = Buffer.from(await request.arrayBuffer());
  const contentType = request.headers.get("content-type") || "";
  if (isCsv(contentType)) return parseDirectsharesConfirmationCsv(bytes.toString("utf8"));
  if (contentType.includes("application/pdf")) return [await parseDirectsharesConfirmationPdf(bytes)];
  return [parseDirectsharesConfirmationText(bytes.toString("utf8"))];
}

async function importGroupedTransactions(transactions: ImportedTransaction[], owner: OwnerType): Promise<ImportResult & { accountCount: number; accounts: string[] }> {
  const storage = getStorage();
  const results: ImportResult[] = [];
  const groups = groupByAccount(transactions);
  for (const [, rows] of groups) {
    results.push(await storage.importDirectsharesTransactions(rows, owner));
  }
  return {
    source: "Directshares Contract Notes",
    ownerType: owner,
    accountKey: groups.length === 1 ? results[0]?.accountKey ?? "DIRECTSHARES" : `${groups.length} accounts`,
    imported: results.reduce((sum, row) => sum + (row.imported ?? 0), 0),
    duplicates: results.reduce((sum, row) => sum + (row.duplicates ?? 0), 0),
    positions: results.reduce((sum, row) => sum + (row.positions ?? 0), 0),
    storageMode: results[0]?.storageMode ?? "postgresql",
    accountCount: groups.length,
    accounts: groups.map(([account, rows]) => `${maskAccount(account)} (${rows.length})`),
  };
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const commit = url.searchParams.get("commit") === "1";
    const owner = ownerFromRequest(request);
    const contentType = request.headers.get("content-type") || "";
    const transactions = contentType.includes("multipart/form-data")
      ? await transactionsFromForm(request)
      : await transactionsFromBody(request);

    if (!commit) {
      return NextResponse.json({
        preview: true,
        source: "Directshares contract notes",
        owner,
        ...summary(transactions),
      });
    }

    return NextResponse.json({
      preview: false,
      ...(await importGroupedTransactions(transactions, owner)),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Directshares confirmation." }, { status: 400 });
  }
}
