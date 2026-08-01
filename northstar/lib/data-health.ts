export type HealthTone = "good" | "warning" | "bad";

type SyncRunHealth = {
  source: string;
  status: string;
  error?: string | null;
};

type ValuationFreshnessHealth = {
  source: string;
  status: string;
};

const expectedSyncSources = ["IBKR", "Directshares Email", "Directshares Dividends", "ABC Bullion"];

// A sync source that keeps failing while the data it produced is still current has a plumbing
// problem, not a data problem. ABC Bullion is the live example: the page blocks non-browser
// clients intermittently, so most attempts are recorded as "skipped" even though a successful
// run has already written today's buyback price. Grading on the last attempt pins the dashboard
// amber more or less permanently, which teaches you to ignore the one signal that should still
// mean something on the day the data really has gone cold. So where a source has a freshness
// check measuring the age of its output, that verdict wins.
const FRESHNESS_FOR_SYNC_SOURCE: Record<string, string> = {
  IBKR: "IBKR positions",
  "ABC Bullion": "Physical metals",
};

function hasCurrentData(syncSource: string, freshnessBySource: Map<string, string>) {
  const freshnessSource = FRESHNESS_FOR_SYNC_SOURCE[syncSource];
  return Boolean(freshnessSource && freshnessBySource.get(freshnessSource) === "fresh");
}

export function dataHealth(syncRuns: SyncRunHealth[] = [], freshness: ValuationFreshnessHealth[] = []) {
  const latestBySource = new Map<string, SyncRunHealth>();
  for (const run of syncRuns) {
    if (!latestBySource.has(run.source)) latestBySource.set(run.source, run);
  }

  const freshnessBySource = new Map<string, string>();
  for (const item of freshness) {
    if (!freshnessBySource.has(item.source)) freshnessBySource.set(item.source, item.status);
  }

  // Runs whose output is demonstrably current are excluded before grading; everything without a
  // freshness counterpart is graded exactly as before.
  const gradedRuns = Array.from(latestBySource.values()).filter((run) => !hasCurrentData(run.source, freshnessBySource));
  const missingConfiguredSource = expectedSyncSources.some(
    (source) => !latestBySource.has(source) && !hasCurrentData(source, freshnessBySource),
  );
  const failedSync = gradedRuns.some((run) => run.status === "failed" || Boolean(run.error));
  const degradedSync = missingConfiguredSource || gradedRuns.some((run) => run.status === "partial" || run.status === "skipped");
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
