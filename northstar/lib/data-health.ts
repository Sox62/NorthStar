export type HealthTone = "good" | "warning" | "bad";

type SyncRunHealth = {
  source: string;
  status: string;
  error?: string | null;
};

type ValuationFreshnessHealth = {
  status: string;
};

const expectedSyncSources = ["IBKR", "Directshares Email", "Directshares Dividends", "ABC Bullion"];

export function dataHealth(syncRuns: SyncRunHealth[] = [], freshness: ValuationFreshnessHealth[] = []) {
  const latestBySource = new Map<string, SyncRunHealth>();
  for (const run of syncRuns) {
    if (!latestBySource.has(run.source)) latestBySource.set(run.source, run);
  }

  const latestRuns = Array.from(latestBySource.values());
  const missingConfiguredSource = expectedSyncSources.some((source) => !latestBySource.has(source));
  const failedSync = latestRuns.some((run) => run.status === "failed" || Boolean(run.error));
  const degradedSync = missingConfiguredSource || latestRuns.some((run) => run.status === "partial" || run.status === "skipped");
  const missingValuation = freshness.some((item) => item.status === "missing");
  const degradedValuation = freshness.some((item) => item.status === "stale" || item.status === "fallback");

  if (failedSync || missingValuation) {
    return { tone: "bad" as HealthTone, label: "Data issue" };
  }
  if (degradedSync || degradedValuation) {
    return { tone: "warning" as HealthTone, label: "Review sync" };
  }
  return { tone: "good" as HealthTone, label: "Data current" };
}
