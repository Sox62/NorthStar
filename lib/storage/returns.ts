import type { PeriodReturn, PeriodReturnKey } from "./types";

export type NavPoint = {
  date: string;
  value: number;
};

const periodMeta: Record<PeriodReturnKey, { label: string; note: string }> = {
  daily: { label: "Daily", note: "Latest snapshot versus previous snapshot." },
  mtd: { label: "MTD", note: "Month-to-date NAV movement." },
  ytd: { label: "YTD", note: "Calendar-year NAV movement." },
  since_inception: { label: "Since inception", note: "First recorded snapshot to latest snapshot." },
};

function emptyReturn(key: PeriodReturnKey, note = "Not enough snapshot history yet."): PeriodReturn {
  return {
    key,
    label: periodMeta[key].label,
    valueAud: null,
    valuePercent: null,
    startValue: null,
    endValue: null,
    startDate: null,
    endDate: null,
    note,
  };
}

function calculateReturn(key: PeriodReturnKey, start: NavPoint | undefined, end: NavPoint | undefined): PeriodReturn {
  if (!start || !end || start.date === end.date || start.value <= 0) return emptyReturn(key);
  const valueAud = end.value - start.value;
  return {
    key,
    label: periodMeta[key].label,
    valueAud,
    valuePercent: (valueAud / start.value) * 100,
    startValue: start.value,
    endValue: end.value,
    startDate: start.date,
    endDate: end.date,
    note: periodMeta[key].note,
  };
}

function firstOnOrAfter(points: NavPoint[], cutoff: string) {
  return points.find((point) => point.date >= cutoff);
}

export function buildPeriodReturns(points: NavPoint[]): PeriodReturn[] {
  const sorted = [...points]
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  const previous = sorted.length >= 2 ? sorted.at(-2) : undefined;
  const snapshotYear = latest?.date.slice(0, 4);
  const snapshotMonth = latest?.date.slice(5, 7);
  const monthStart = snapshotYear && snapshotMonth ? `${snapshotYear}-${snapshotMonth}-01` : "";
  const yearStart = snapshotYear ? `${snapshotYear}-01-01` : "";

  return [
    calculateReturn("daily", previous, latest),
    calculateReturn("mtd", firstOnOrAfter(sorted, monthStart), latest),
    calculateReturn("ytd", firstOnOrAfter(sorted, yearStart), latest),
    calculateReturn("since_inception", sorted[0], latest),
  ];
}
