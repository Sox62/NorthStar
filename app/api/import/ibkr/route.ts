import { NextResponse } from "next/server";
import { parseIbkrFlexXml } from "@/lib/integrations/ibkr";
import { getStorage, type OwnerType } from "@/lib/storage";

export const runtime = "nodejs";

const maskAccount = (account: string) => account.length <= 4 ? account : `${account.slice(0, 2)}••••${account.slice(-3)}`;

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const commit = url.searchParams.get("commit") === "1";
    const owner = (url.searchParams.get("owner") || "SMSF").toUpperCase() as OwnerType;
    if (owner !== "SMSF" && owner !== "PERSONAL") throw new Error("Invalid portfolio owner.");
    const transactions = parseIbkrFlexXml(await request.text());
    const securities = transactions.filter(transaction => transaction.type !== "FX");
    const fx = transactions.filter(transaction => transaction.type === "FX");
    const account = transactions.find(transaction => transaction.externalAccountId)?.externalAccountId || "IBKR";
    const uniqueInstruments = new Set(securities.map(transaction => transaction.instrumentKey)).size;

    if (!commit) {
      return NextResponse.json({
        preview: true,
        source: "IBKR Flex XML",
        account: maskAccount(account),
        records: transactions.length,
        securityExecutions: securities.length,
        fxExecutions: fx.length,
        uniqueInstruments,
        owner,
        note: "IBKR positions will initially be valued at remaining AUD cost basis until Open Positions or live market prices are connected.",
      });
    }

    return NextResponse.json({ preview: false, ...(await getStorage().importIbkr(transactions, owner)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid IBKR XML" }, { status: 400 });
  }
}
