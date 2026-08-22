import assert from "node:assert/strict";
import test from "node:test";
import { buildNavSeries, filterByRange, navSeriesStats, runningPeak, valueForScope, type PerformancePoint } from "./nav-series";

const day = (date: string, personal: number, personalInvested: number, smsf: number, smsfInvested: number): PerformancePoint => ({
  date,
  personal,
  personalInvested,
  smsf,
  smsfInvested,
  overall: personal + smsf,
  overallInvested: personalInvested + smsfInvested,
});

const performance = [
  day("2026-07-01", 500_000, 480_000, 300_000, 240_000),
  day("2026-07-02", 520_000, 500_000, 310_000, 250_000),
  day("2026-07-03", 470_000, 450_000, 305_000, 245_000),
];

test("buildNavSeries splits NAV into invested and cash per scope", () => {
  const [first] = buildNavSeries({ performance, scope: "overall", mode: "nav", range: "itd" });

  assert.equal(first.nav, 800_000);
  assert.equal(first.invested, 720_000);
  assert.equal(first.cash, 80_000, "cash is the residual of NAV less invested");
});

test("scope selects the right owner and mode selects NAV or invested", () => {
  const point = performance[0];

  assert.equal(valueForScope(point, "personal", "nav"), 500_000);
  assert.equal(valueForScope(point, "personal", "shares"), 480_000);
  assert.equal(valueForScope(point, "smsf", "nav"), 300_000);
  assert.equal(valueForScope(point, "overall", "shares"), 720_000);
});

test("navSeriesStats reports peak, low and the extreme daily moves", () => {
  const series = buildNavSeries({ performance, scope: "overall", mode: "nav", range: "itd" });
  const stats = navSeriesStats(series);

  assert.ok(stats);
  assert.equal(stats.peak, 830_000);
  assert.equal(stats.peakDate, "2026-07-02");
  assert.equal(stats.floor, 775_000);
  assert.equal(stats.floorDate, "2026-07-03");
  assert.ok(stats.bestDayPercent > 0, "the 800k to 830k step is the best day");
  assert.ok(stats.worstDayPercent < 0, "the 830k to 775k step is the worst day");
});

test("runningPeak only looks backwards, so drawdown is measured from the peak to date", () => {
  const series = buildNavSeries({ performance, scope: "overall", mode: "nav", range: "itd" });

  assert.equal(runningPeak(series, 0), 800_000);
  assert.equal(runningPeak(series, 2), 830_000);
});

test("a range with fewer than two snapshots falls back to the full series", () => {
  const series = buildNavSeries({ performance, scope: "overall", mode: "nav", range: "itd" });

  assert.equal(filterByRange(series, "1m").length, 3,
    "these snapshots are older than a month relative to nothing, so the guard keeps them");
  assert.equal(filterByRange([series[0]], "1m").length, 1);
});

test("undated and non-positive snapshots are dropped rather than charted as zero", () => {
  const messy: PerformancePoint[] = [
    ...performance,
    { date: "not-a-date", personal: 10, smsf: 10, overall: 20 },
    { date: "2026-07-04", personal: 0, smsf: 0, overall: 0 },
  ];

  const series = buildNavSeries({ performance: messy, scope: "overall", mode: "nav", range: "itd" });
  assert.equal(series.length, 3);
  assert.deepEqual(series.map((point) => point.date), ["2026-07-01", "2026-07-02", "2026-07-03"]);
});

test("series is sorted by date even when snapshots arrive out of order", () => {
  const shuffled = [performance[2], performance[0], performance[1]];
  const series = buildNavSeries({ performance: shuffled, scope: "overall", mode: "nav", range: "itd" });

  assert.deepEqual(series.map((point) => point.date), ["2026-07-01", "2026-07-02", "2026-07-03"]);
});


test("performance mode rebases to an index instead of additive NAV dollars", () => {
  const series = buildNavSeries({ performance, scope: "overall", mode: "performance", range: "itd" });

  assert.equal(series[0].value, 100);
  assert.equal(Number(series[1].value.toFixed(4)), Number(((500_000 + 250_000) / (480_000 + 240_000) * 100).toFixed(4)));
});

test("performance mode mutes large external cash-flow jumps that distort NAV", () => {
  const deposit = [
    day("2026-07-01", 500_000, 480_000, 300_000, 240_000),
    day("2026-07-02", 800_000, 480_000, 300_000, 240_000),
  ];
  const navSeries = buildNavSeries({ performance: deposit, scope: "overall", mode: "nav", range: "itd" });
  const performanceSeries = buildNavSeries({ performance: deposit, scope: "overall", mode: "performance", range: "itd" });

  assert.equal(navSeries[1].value, 1_100_000, "NAV still shows the new cash in the account");
  assert.equal(performanceSeries[1].value, 100, "performance stays flat because invested value did not move");
});
