import assert from "node:assert/strict";
import test from "node:test";
import { buildSparklines, sparklinePoints, type SparkPriceRow } from "./sparkline";

const row = (symbol: string, exchange: string, priceDate: string, close: number): SparkPriceRow => ({
  symbol, exchange, priceDate, close, currency: "USD", retrievedAt: `${priceDate}T00:00:00.000Z`,
});

const instruments = [
  { symbol: "CDE", exchange: "NYSE", name: "Coeur", currency: "USD" },
  { symbol: "GDX", exchange: "ASX", name: "Gold miners", currency: "AUD" },
];

test("every series is aligned to one shared date axis", () => {
  // GDX does not trade on the 2nd; the axis still carries it so a crosshair reads both.
  const { dates, series } = buildSparklines({
    prices: [
      row("CDE", "NYSE", "2026-08-01", 10),
      row("CDE", "NYSE", "2026-08-02", 11),
      row("CDE", "NYSE", "2026-08-03", 12),
      row("GDX", "ASX", "2026-08-01", 90),
      row("GDX", "ASX", "2026-08-03", 99),
    ],
    instruments,
  });

  assert.deepEqual(dates, ["2026-08-01", "2026-08-02", "2026-08-03"]);
  for (const item of series) assert.equal(item.values.length, dates.length, `${item.label} must span the axis`);
});

test("a gap carries the last close forward rather than dropping to zero", () => {
  const { series } = buildSparklines({
    prices: [
      row("GDX", "ASX", "2026-08-01", 90),
      row("GDX", "ASX", "2026-08-03", 99),
      row("CDE", "NYSE", "2026-08-01", 10),
      row("CDE", "NYSE", "2026-08-02", 11),
      row("CDE", "NYSE", "2026-08-03", 12),
    ],
    instruments,
  });
  const gdx = series.find((item) => item.label === "GDX");

  assert.deepEqual(gdx?.values, [90, 90, 99], "the missing day holds the prior close");
});

test("change is measured across the window, and series sort by it", () => {
  const { series } = buildSparklines({
    prices: [
      row("CDE", "NYSE", "2026-08-01", 10),
      row("CDE", "NYSE", "2026-08-02", 11),
      row("GDX", "ASX", "2026-08-01", 100),
      row("GDX", "ASX", "2026-08-02", 90),
    ],
    instruments,
  });

  assert.equal(series[0].label, "CDE", "strongest first");
  assert.equal(series[0].changePercent, 10);
  assert.equal(Number(series[1].changePercent.toFixed(4)), -10);
});

test("the newest retrieval wins when a date is priced twice", () => {
  const { series } = buildSparklines({
    prices: [
      { ...row("CDE", "NYSE", "2026-08-01", 10), retrievedAt: "2026-08-01T01:00:00.000Z" },
      { ...row("CDE", "NYSE", "2026-08-02", 11), retrievedAt: "2026-08-02T01:00:00.000Z" },
      { ...row("CDE", "NYSE", "2026-08-02", 99), retrievedAt: "2026-08-02T09:00:00.000Z" },
    ],
    instruments,
  });

  assert.equal(series[0].latest, 99);
});

test("a window keeps the series seeded from before it", () => {
  const prices = Array.from({ length: 10 }, (_, index) =>
    row("CDE", "NYSE", `2026-08-${String(index + 1).padStart(2, "0")}`, 10 + index));
  const { dates, series } = buildSparklines({ prices, instruments, days: 3 });

  assert.ok(dates.length < 10 && dates.length >= 2);
  assert.equal(series[0].values.length, dates.length);
  assert.ok(series[0].values.every((value) => Number.isFinite(value)));
});

test("unpriced, zero and unknown instruments are excluded rather than charted flat", () => {
  const { series } = buildSparklines({
    prices: [
      row("CDE", "NYSE", "2026-08-01", 0),
      row("CDE", "NYSE", "2026-08-02", 11),
      row("ZZZ", "NYSE", "2026-08-01", 5),
      row("ZZZ", "NYSE", "2026-08-02", 6),
    ],
    instruments,
  });

  assert.equal(series.length, 0, "one good close is not a series, and ZZZ is not requested");
});

test("points map onto the viewBox and skip gaps", () => {
  const points = sparklinePoints([10, 20], 100, 40);
  assert.equal(points, "0.0,38.0 100.0,2.0", "low sits at the bottom, high at the top");

  assert.equal(sparklinePoints([Number.NaN, 10, 20], 100, 40).split(" ").length, 2, "the gap is not drawn");
  assert.equal(sparklinePoints([10], 100, 40), "", "a single point is not a line");
});

test("a flat series still renders without dividing by zero", () => {
  const points = sparklinePoints([5, 5, 5], 100, 40);
  assert.equal(points.split(" ").length, 3);
  assert.ok(points.split(" ").every((point) => Number.isFinite(Number(point.split(",")[1]))));
});
