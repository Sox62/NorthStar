import { NextResponse } from "next/server";
import { getStorage, type OwnerType, type Scope } from "@/lib/storage";
import { buildTaxLots } from "@/lib/tax-lots";

export const runtime = "nodejs";

function scopeFromRequest(request: Request): Scope {
  const requested = new URL(request.url).searchParams.get("scope");
  return requested === "personal" || requested === "smsf" ? requested : "overall";
}

function ownerTypeForScope(scope: Scope): OwnerType | undefined {
  if (scope === "personal") return "PERSONAL";
  if (scope === "smsf") return "SMSF";
  return undefined;
}

export async function GET(request: Request) {
  try {
    const scope = scopeFromRequest(request);
    const storage = getStorage();
    const [dashboard, transactions] = await Promise.all([
      storage.dashboard(scope),
      storage.listTransactions(ownerTypeForScope(scope)),
    ]);
    return NextResponse.json(buildTaxLots(dashboard, transactions));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build tax lots" }, { status: 500 });
  }
}
