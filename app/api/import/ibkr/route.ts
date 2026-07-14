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

    const report = parseIbkrFlexXml(await request.text());
    const securities = report.transactions.filter(transaction => transaction.type !== "FX");
    const fx = report.transactions.filter(transaction => transaction.type === "FX");
    const uniqueInstruments = new Set([
      ...securities.map(transaction => transaction.instrumentKey),
      ...report.openPositions.map(position => position.instrumentKey),
    ]).size;

    if (!commit) {
      return NextResponse.json({
        preview: true,
        source: "IBKR Flex XML",
        account: maskAccount(report.accountId),
        records: report.transactions.length,
        securityExecutions: securities.length,
        fxExecutions: fx.length,
        uniqueInstruments,
        openPositions: report.openPositions.length,
        cashAud: report.cash?.balanceAud ?? 0,
        statementTo: report.toDate,
        owner,
        note: report.openPositions.length
          ? "Current IBKR holdings will be replaced from Open Positions and IBKR cash will be updated from Cash Report."
          : "No Open Positions section was found, so IBKR holdings will remain valued at remaining AUD cost basis.",
      });
    }

    return NextResponse.json({ preview: false, ...(await getStorage().importIbkr(report, owner)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid IBKR XML" }, { status: 400 });
  }
}
