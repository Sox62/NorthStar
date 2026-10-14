import assert from "node:assert/strict";
import test from "node:test";
import {
  holdingSelectionKey,
  isParcelSelectionMethod,
  methodForHolding,
  orderParcelsForDisposal,
  readParcelSelection,
  type ParcelSelectionMethod,
} from "./parcel-selection";

/** Three parcels of one holding, bought at rising prices. */
const parcels = [
  { acquisitionDate: "2021-06-01", remainingQuantity: 100, costPerUnitAud: 1 },
  { acquisitionDate: "2023-06-01", remainingQuantity: 100, costPerUnitAud: 3 },
  { acquisitionDate: "2025-06-01", remainingQuantity: 100, costPerUnitAud: 2 },
];

/** Sold at 5, nothing discounted, so the taxable gain per unit is just proceeds less cost. */
const grossGain = (parcel: { costPerUnitAud: number }) => 5 - parcel.costPerUnitAud;

const order = (method: ParcelSelectionMethod, gain: (parcel: (typeof parcels)[number]) => number = grossGain) =>
  orderParcelsForDisposal(parcels, method, gain).map((parcel) => parcel.acquisitionDate);

test("first in, first out takes the oldest parcel", () => {
  assert.deepEqual(order("fifo"), ["2021-06-01", "2023-06-01", "2025-06-01"]);
});

test("last in, first out takes the newest", () => {
  assert.deepEqual(order("lifo"), ["2025-06-01", "2023-06-01", "2021-06-01"]);
});

test("minimising the gain takes the dearest parcel, whatever its age", () => {
  // The 2023 parcel cost 3 and the 2025 one cost 2, so the smaller gain is on the older of the two.
  // This is the ordering Sharesight used on SILJ: 34.25, then 25.79, then 23.70 a unit.
  assert.deepEqual(order("minimise_gain"), ["2023-06-01", "2025-06-01", "2021-06-01"]);
});

test("maximising the gain takes the cheapest", () => {
  assert.deepEqual(order("maximise_gain"), ["2021-06-01", "2025-06-01", "2023-06-01"]);
});

test("minimising sorts on the taxable gain, not the gross one", () => {
  /*
   * The 2021 parcel's gross gain is the largest of the three, but it is held over twelve months so
   * only half of it is taxable — which makes it the cheapest parcel to sell. Sorting on the gross
   * gain would choose differently and call it minimising tax while not doing so.
   */
  const discounted = (parcel: { acquisitionDate: string | null; costPerUnitAud: number }) =>
    (parcel.acquisitionDate === "2021-06-01" ? 0.5 : 1) * (5 - parcel.costPerUnitAud);
  assert.deepEqual(order("minimise_gain", discounted), ["2021-06-01", "2023-06-01", "2025-06-01"]);
});

test("an exempt fund falls back to acquisition date rather than an arbitrary order", () => {
  // In pension phase every parcel's taxable gain is nil, so the comparison decides nothing. Without
  // a fallback the result would depend on the order storage happened to return the rows in.
  assert.deepEqual(order("minimise_gain", () => 0), ["2021-06-01", "2023-06-01", "2025-06-01"]);
  assert.deepEqual(order("maximise_gain", () => 0), ["2021-06-01", "2023-06-01", "2025-06-01"]);
});

test("parcels bought on one day keep the order they arrived in", () => {
  // Two buys on the same date are distinct parcels, and a reproducible report needs them to stay
  // in a fixed order rather than being shuffled by an unstable comparison.
  const sameDay = [
    { acquisitionDate: "2025-01-01", remainingQuantity: 10, costPerUnitAud: 1 },
    { acquisitionDate: "2025-01-01", remainingQuantity: 20, costPerUnitAud: 1 },
  ];
  const ordered = orderParcelsForDisposal(sameDay, "fifo", grossGain);
  assert.deepEqual(ordered.map((parcel) => parcel.remainingQuantity), [10, 20]);
});

test("a holding's own method beats the report default", () => {
  const selection = { method: "fifo" as const, overrides: { "SILJ:US": "minimise_gain" as const } };
  assert.equal(methodForHolding(selection, { symbol: "SILJ", exchange: "US" }), "minimise_gain");
  assert.equal(methodForHolding(selection, { symbol: "SIL", exchange: "US" }), "fifo");
  // Case and spelling of the key must not decide whether an election applies.
  assert.equal(methodForHolding(selection, { symbol: "silj", exchange: "us" }), "minimise_gain");
  assert.equal(holdingSelectionKey({ symbol: "silj", exchange: "us" }), "SILJ:US");
});

test("only the four known methods are accepted", () => {
  assert.equal(isParcelSelectionMethod("fifo"), true);
  assert.equal(isParcelSelectionMethod("minimise_gain"), true);
  assert.equal(isParcelSelectionMethod("average_cost"), false, "not available under Australian CGT");
  assert.equal(isParcelSelectionMethod(""), false);
  assert.equal(isParcelSelectionMethod(undefined), false);
});

test("a stored selection is read back, and anything unrecognised is discarded", () => {
  // The overrides are JSON in one column, so an older build, a hand-edited row or a method from a
  // future version can all turn up. Matching parcels by an unknown rule would change a reported
  // gain with nothing to say why, so the default takes over instead.
  assert.deepEqual(readParcelSelection("lifo", { "silj:us": "minimise_gain" }), {
    method: "lifo",
    overrides: { "SILJ:US": "minimise_gain" },
  });
  assert.deepEqual(readParcelSelection("average_cost", null), { method: "fifo" });
  assert.deepEqual(readParcelSelection(undefined, undefined), { method: "fifo" });
  // A bad entry is dropped on its own; the good ones beside it still apply.
  assert.deepEqual(readParcelSelection("fifo", { "SILJ:US": "minimise_gain", "BOE:ASX": "nonsense", "": "lifo" }), {
    method: "fifo",
    overrides: { "SILJ:US": "minimise_gain" },
  });
  // Nothing usable leaves no overrides key at all, rather than an empty object to reason about.
  assert.deepEqual(readParcelSelection("fifo", { "BOE:ASX": 7 }), { method: "fifo" });
  assert.deepEqual(readParcelSelection("fifo", ["minimise_gain"]), { method: "fifo" });
});
