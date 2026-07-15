import type { CashAccount, ManualAsset, StoredPosition, SyncRun, ValuationFreshness } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function latestDate(values: Array<string | null | undefined>) {
  return values
    .map(parseDate)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function ageDays(asOf: Date | null, now: Date) {
  if (!asOf) return null;
  return Math.max(0, Math.round(((now.getTime() - asOf.getTime()) / DAY_MS) * 10) / 10);
}

function datedCheck(input: {
  source: string;
  asOf: Date | null;
  staleAfterDays: number;
  freshDetail: string;
  missingDetail: string;
  now: Date;
}): ValuationFreshness {
  const asOf = input.asOf;
  const age = ageDays(asOf, input.now);
  if (!asOf || age == null) {
    return {
      source: input.source,
      status: "missing",
      asOf: null,
      ageDays: null,
      staleAfterDays: input.staleAfterDays,
      detail: input.missingDetail,
    };
  }
  return {
    source: input.source,
    status: age <= input.staleAfterDays ? "fresh" : "stale",
    asOf: asOf.toISOString(),
    ageDays: age,
    staleAfterDays: input.staleAfterDays,
    detail: input.freshDetail,
  };
}

export function buildValuationFreshness(input: {
  positions: StoredPosition[];
  cashAccounts: CashAccount[];
  manualAssets: ManualAsset[];
  syncRuns: SyncRun[];
  now?: Date;
}): ValuationFreshness[] {
  const now = input.now ?? new Date();
  const checks: ValuationFreshness[] = [];
  const ibkrPositions = input.positions.filter((position) => position.broker === "IBKR");
  const latestIbkrSync = input.syncRuns.find((run) => run.source === "IBKR");

  if (ibkrPositions.length) {
    checks.push(datedCheck({
      source: "IBKR positions",
      asOf: latestDate(ibkrPositions.map((position) => position.asOfDate)),
      staleAfterDays: 2,
      freshDetail: `${ibkrPositions.length} broker position${ibkrPositions.length === 1 ? "" : "s"} valued from current positions.`,
      missingDetail: "No IBKR position date is available.",
      now,
    }));
  } else {
    checks.push({
      source: "IBKR positions",
      status: latestIbkrSync?.status === "failed" ? "stale" : "missing",
      asOf: latestIbkrSync?.finishedAt ?? null,
      ageDays: latestIbkrSync ? ageDays(parseDate(latestIbkrSync.finishedAt), now) : null,
      staleAfterDays: 2,
      detail: latestIbkrSync?.error ?? "No IBKR positions are recorded for this view.",
    });
  }

  if (input.cashAccounts.length) {
    checks.push(datedCheck({
      source: "Cash balances",
      asOf: latestDate(input.cashAccounts.map((account) => account.asOfDate || account.updatedAt)),
      staleAfterDays: 7,
      freshDetail: `${input.cashAccounts.length} cash balance${input.cashAccounts.length === 1 ? "" : "s"} included in NAV.`,
      missingDetail: "No cash balance date is available.",
      now,
    }));
  }

  if (input.manualAssets.length) {
    checks.push(datedCheck({
      source: "Physical metals",
      asOf: latestDate(input.manualAssets.map((asset) => asset.priceRetrievedAt ?? asset.asOfDate)),
      staleAfterDays: 2,
      freshDetail: `${input.manualAssets.length} physical metal position${input.manualAssets.length === 1 ? "" : "s"} valued from dealer buyback pricing.`,
      missingDetail: "No dealer price timestamp is available.",
      now,
    }));
  }

  const fallbackPositions = input.positions.filter((position) => position.valuationBasis === "cost_basis");
  if (fallbackPositions.length) {
    checks.push({
      source: "Market pricing",
      status: "fallback",
      asOf: latestDate(fallbackPositions.map((position) => position.asOfDate))?.toISOString() ?? null,
      ageDays: null,
      staleAfterDays: null,
      detail: `${fallbackPositions.length} position${fallbackPositions.length === 1 ? "" : "s"} valued at cost basis because no market snapshot is available.`,
    });
  }

  return checks;
}
