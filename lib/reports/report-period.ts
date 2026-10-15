import { financialYear, financialYearFromRequest } from "./eofy/utils";

export type ReportPeriod = {
  label: string;
  startDate: string;
  endDate: string;
  /** False when no period was asked for, which means every date on record. */
  scoped: boolean;
};

const isoDay = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date that exists, not merely one that is shaped like one.
 *
 * `2026-02-30` matched the pattern and sorted correctly against its neighbours, so a range could
 * open on a day that never happened and report a period nobody could check. Round-tripping through
 * UTC catches it: the parser rolls 30 February into 2 March, and the rolled value no longer matches
 * what was asked for.
 */
function isRealCalendarDay(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Stands in for an open-ended period, so every section can filter on one pair of bounds. */
const allDates: ReportPeriod = { label: "all dates", startDate: "0001-01-01", endDate: "9999-12-31", scoped: false };

/**
 * The period a report request asks for: a financial year as `year=2026`, an arbitrary range as
 * `from=&to=`, or, with neither, every date on record.
 *
 * Omitting the dates keeps the whole history, which is what the tax position export has always
 * returned. A default of the current year would silently shorten a download someone is about to
 * lodge from.
 *
 * A half-given range is rejected rather than completed. `from` with no `to` could reasonably mean
 * "since then" or "that day", and a report that quietly picks one would be wrong half the time
 * without ever looking wrong.
 */
export function reportPeriod(params: URLSearchParams, today = new Date()): ReportPeriod {
  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    if (!isoDay.test(from ?? "") || !isoDay.test(to ?? "")) {
      throw new Error("A date range needs both from and to, each as YYYY-MM-DD.");
    }
    const unreal = [from!, to!].find((value) => !isRealCalendarDay(value));
    if (unreal) throw new Error(`${unreal} is not a date on the calendar.`);
    if (from! > to!) throw new Error("from must not be later than to.");
    return { label: `${from} to ${to}`, startDate: from!, endDate: to!, scoped: true };
  }
  const requested = params.get("year");
  if (!requested) return allDates;
  const year = financialYear(financialYearFromRequest(requested, today));
  return { label: year.label, startDate: year.startDate, endDate: year.endDate, scoped: true };
}
