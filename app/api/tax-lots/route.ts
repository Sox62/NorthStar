import { NextResponse } from "next/server";
import { reportPeriod } from "@/lib/reports/report-period";
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
  const params = new URL(request.url).searchParams;
  /*
   * Read before touching storage, so a malformed range answers 400 rather than 500 — the same
   * split the tax position export makes, and for the same reason: one is the caller's to fix.
   */
  let period;
  try {
    period = reportPeriod(params);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unusable date range" }, { status: 400 });
  }

  try {
    const scope = scopeFromRequest(request);
    const storage = getStorage();
    const [dashboard, transactions, profiles] = await Promise.all([
      storage.dashboard(scope),
      storage.listTransactions(ownerTypeForScope(scope)),
      storage.listTaxProfiles(),
    ]);
    // Overall spans both books, and a pension-phase exemption belongs to one of them, so the
    // combined view stays on accumulation rather than exempting the personal side with the fund.
    const ownerType = ownerTypeForScope(scope);
    const profile = profiles.find((item) => item.ownerType === ownerType);
    const pensionPhase = scope === "overall" ? false : profile?.pensionPhase ?? false;
    return NextResponse.json(buildTaxLots(
      dashboard,
      transactions,
      new Date(),
      { pensionPhase },
      profile?.parcelSelection,
      period.scoped ? period : undefined,
    ));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build tax lots" }, { status: 500 });
  }
}
