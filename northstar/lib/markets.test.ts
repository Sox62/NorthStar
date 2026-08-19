import assert from "node:assert/strict";
import test from "node:test";
import { dailyMove, describeMove, formatMarketPrice, formatMove, ratioMove } from "./markets";

const reading = (price: number, previousClose: number | null, currency = "USD", unit: "oz" | "lb" | "index" | "unit" = "oz") =>
  ({ price, previousClose, currency, unit });

test("a daily move is signed against the prior close", () => {
  const up = dailyMove(4410.4, 4366)!;
  assert.equal(up.direction, "up");
  assert.equal(up.percent.toFixed(2), "1.02");

  const down = dailyMove(63.205, 64.988)!;
  assert.equal(down.direction, "down");
  assert.equal(down.percent.toFixed(2), "-2.74");
});

test("a move too small to print is flat rather than arrowed", () => {
  // 0.001% renders as "0.00%", so an arrow would claim a direction the digits do not show.
  assert.equal(dailyMove(100.001, 100)?.direction, "flat");
  assert.equal(dailyMove(99.999, 100)?.direction, "flat");
  assert.equal(formatMove(dailyMove(100.001, 100)), "– 0.00%");
});

test("a missing or nonsensical prior close yields no move rather than a wrong one", () => {
  assert.equal(dailyMove(4410, null), null);
  assert.equal(dailyMove(null, 4366), null);
  assert.equal(dailyMove(4410, 0), null);
  assert.equal(dailyMove(4410, -5), null);
});

test("the ratio move compounds the legs instead of subtracting their percentages", () => {
  // Gold +1.02%, silver -2.74%: the GSR is up 3.87%, not the 3.76% a subtraction would give.
  const move = ratioMove(reading(4410.4, 4366), reading(63.205, 64.988))!;
  assert.equal(move.direction, "up");
  assert.equal(move.percent.toFixed(2), "3.87");
});

test("the ratio move needs both legs before it will print", () => {
  assert.equal(ratioMove(reading(4410.4, 4366), null), null);
  assert.equal(ratioMove(reading(4410.4, null), reading(63.205, 64.988)), null);
  assert.equal(ratioMove(reading(4410.4, 4366), reading(63.205, 0)), null);
});

test("prices carry their own currency, not an assumed USD", () => {
  assert.equal(formatMarketPrice(reading(4410.4, null)), "USD 4,410.40/oz");
  // Sprott is a CAD listing; showing it as USD would misprice the tile by the cross rate.
  assert.equal(formatMarketPrice(reading(26.76, null, "CAD", "unit")), "CAD 26.76");
  assert.equal(formatMarketPrice(reading(7691.76, null, "USD", "index")), "USD 7,691.76");
});

test("sub-ten prices keep a third decimal so the day is visible", () => {
  // Copper's whole daily move lives in the third decimal: 6.47 would show nothing moving.
  assert.equal(formatMarketPrice(reading(6.467, null, "USD", "lb")), "USD 6.467/lb");
  assert.equal(formatMarketPrice(reading(63.205, null)), "USD 63.21/oz");
});

test("an absent price prints nothing rather than a zero", () => {
  assert.equal(formatMarketPrice(null), null);
  assert.equal(formatMarketPrice(reading(0, 100)), null);
  assert.equal(formatMove(null), null);
});

test("moves are described in words for screen readers", () => {
  assert.equal(describeMove(dailyMove(4410.4, 4366)), "up 1.02% on the day");
  assert.equal(describeMove(dailyMove(63.205, 64.988)), "down 2.74% on the day");
  assert.equal(describeMove(null), "daily move unavailable");
});
