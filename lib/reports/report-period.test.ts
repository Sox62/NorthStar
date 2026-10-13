import assert from "node:assert/strict";
import test from "node:test";
import { reportPeriod } from "./report-period";

const period = (query: string, today = new Date("2026-10-14T00:00:00.000Z")) =>
  reportPeriod(new URLSearchParams(query), today);

test("no dates means every date on record", () => {
  // The tax position export has always returned the whole history. Defaulting to the current year
  // would shorten a download someone is about to lodge from, without ever looking wrong.
  const result = period("");
  assert.equal(result.scoped, false);
  assert.equal(result.label, "all dates");
  assert.ok(result.startDate < "1900-01-01" && result.endDate > "2100-01-01");
});

test("a year is the Australian financial year ending in it", () => {
  const result = period("year=2026");
  assert.equal(result.startDate, "2025-07-01");
  assert.equal(result.endDate, "2026-06-30");
  assert.equal(result.label, "FY2026");
  assert.equal(result.scoped, true);
});

test("an explicit range is taken as given", () => {
  const result = period("from=2026-01-01&to=2026-03-31");
  assert.equal(result.startDate, "2026-01-01");
  assert.equal(result.endDate, "2026-03-31");
  assert.equal(result.scoped, true);
});

test("a range takes precedence over a year rather than being combined with it", () => {
  const result = period("year=2026&from=2026-01-01&to=2026-03-31");
  assert.equal(result.startDate, "2026-01-01");
  assert.equal(result.endDate, "2026-03-31");
});

test("half a range is refused, never completed", () => {
  // "from" alone could mean "since then" or "that day", and picking one would be wrong half the
  // time while still producing a report that looks right.
  assert.throws(() => period("from=2026-01-01"), /both from and to/);
  assert.throws(() => period("to=2026-03-31"), /both from and to/);
});

test("a malformed or reversed range is refused", () => {
  assert.throws(() => period("from=01/01/2026&to=31/03/2026"), /YYYY-MM-DD/);
  assert.throws(() => period("from=2026-03-31&to=2026-01-01"), /not be later than/);
});

test("an unusable year falls back to the reporting year rather than failing", () => {
  // A year is a convenience on a URL, not a boundary a report should die on, and the EOFY report
  // already treats it this way. In October 2026 the year being reported on is the one that closed
  // on 30 June 2026, not the one now running.
  const result = period("year=banana");
  assert.equal(result.startDate, "2025-07-01");
  assert.equal(result.endDate, "2026-06-30");
});
