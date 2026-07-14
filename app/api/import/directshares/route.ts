import { NextResponse } from "next/server";
import { parseDirectsharesHoldingsCsv } from "@/lib/integrations/directshares";
import { getStorage, type OwnerType } from "@/lib/storage";

export const runtime = "nodejs";

const maskAccount = (account: string) => account.length <= 4 ? account : `${account.slice(0, 2)}••••${account.slice(-3)}`;

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const commit = url.searchParams.get("commit") === "1";
    const owner = (url.searchParams.get("owner") || "PERSONAL").toUpperCase() as OwnerType;
    if (owner !== "SMSF" && owner !== "PERSONAL") throw new Error("Invalid portfolio owner.");
    const positions = parseDirectsharesHoldingsCsv(await request.text());
    const account = positions.find(position => position.externalAccountId)?.externalAccountId || "Directshares";
    const totalValue = positions.reduce((sum, position) => sum + position.marketValueAud, 0);
    const totalCost = positions.reduce((sum, position) => sum + position.costAud, 0);
    const totalPnl = positions.reduce((sum, position) => sum + position.pnlAud, 0);

    if (!commit) {
      return NextResponse.json({
        preview: true,
        source: "Directshares holdings CSV",
        account: maskAccount(account),
        positions: positions.length,
        totalValue,
        totalCost,
        totalPnl,
        owner,
      });
    }

    return NextResponse.json({ preview: false, ...(await getStorage().importDirectshares(positions, owner)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Directshares CSV" }, { status: 400 });
  }
}
