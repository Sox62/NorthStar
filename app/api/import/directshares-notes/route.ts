import { NextResponse } from "next/server";
import {
  parseDirectsharesConfirmationPdf,
  parseDirectsharesConfirmationText,
} from "@/lib/integrations/directshares";
import { getStorage, type OwnerType } from "@/lib/storage";
import type { ImportedTransaction } from "@/lib/integrations/types";

export const runtime = "nodejs";

const maskAccount = (account: string) => account.length <= 4 ? account : `${account.slice(0, 2)}••••${account.slice(-3)}`;

function ownerFromRequest(request: Request): OwnerType {
  const owner = (new URL(request.url).searchParams.get("owner") || "PERSONAL").toUpperCase();
  if (owner !== "SMSF" && owner !== "PERSONAL") throw new Error("Invalid portfolio owner.");
  return owner;
}

function summary(transactions: ImportedTransaction[]) {
  const account = transactions.find((transaction) => transaction.externalAccountId)?.externalAccountId || "DIRECTSHARES";
  const buys = transactions.filter((transaction) => transaction.type === "BUY").length;
  const sells = transactions.filter((transaction) => transaction.type === "SELL").length;
  const netCash = transactions.reduce((sum, transaction) => sum + (transaction.netCash ?? 0), 0);
  const fees = transactions.reduce((sum, transaction) => sum + (transaction.fees ?? 0), 0);
  const grossConsideration = transactions.reduce((sum, transaction) => sum + Math.abs(transaction.cost ?? 0), 0);
  return { account: maskAccount(account), trades: transactions.length, buys, sells, grossConsideration, netCash, fees };
}

async function transactionsFromForm(request: Request) {
  const form = await request.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!files.length) throw new Error("Upload at least one Directshares confirmation PDF or text file.");

  const transactions: ImportedTransaction[] = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const lowerName = file.name.toLowerCase();
    if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
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
  if (contentType.includes("application/pdf")) return [await parseDirectsharesConfirmationPdf(bytes)];
  return [parseDirectsharesConfirmationText(bytes.toString("utf8"))];
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

    const accounts = new Set(transactions.map((transaction) => transaction.externalAccountId || "DIRECTSHARES"));
    if (accounts.size > 1) throw new Error("Upload one Directshares account at a time.");

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
      ...(await getStorage().importDirectsharesTransactions(transactions, owner)),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Directshares confirmation." }, { status: 400 });
  }
}
