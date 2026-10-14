/**
 * Which parcels a disposal consumes.
 *
 * This is a genuine tax lever, not a presentation choice: the same sale of the same holding
 * produces a different gain depending on which acquisitions it is matched against, and the choice
 * is the taxpayer's to make and to keep records of. Sharesight's FY2025-26 report for this
 * portfolio used first-in-first-out on 51 of 56 disposals and minimise-CGT on the other five, all
 * of them one holding — so the method has to be settable per holding, not per report.
 */

export const parcelSelectionMethods = ["fifo", "lifo", "minimise_gain", "maximise_gain"] as const;

export type ParcelSelectionMethod = (typeof parcelSelectionMethods)[number];

export const defaultParcelSelectionMethod: ParcelSelectionMethod = "fifo";

export type ParcelSelection = {
  /** Used for any holding without a method of its own. */
  method: ParcelSelectionMethod;
  /** Per holding, keyed by `holdingSelectionKey`. */
  overrides?: Record<string, ParcelSelectionMethod>;
};

/** The minimum a parcel has to look like to be ordered. `WorkingLot` satisfies this structurally. */
export type SelectableParcel = {
  acquisitionDate: string | null;
  remainingQuantity: number;
  costPerUnitAud: number;
};

export const parcelSelectionLabels: Record<ParcelSelectionMethod, string> = {
  fifo: "First in, first out",
  lifo: "Last in, first out",
  minimise_gain: "Minimise capital gain",
  maximise_gain: "Maximise capital gain",
};

export function isParcelSelectionMethod(value: unknown): value is ParcelSelectionMethod {
  return typeof value === "string" && (parcelSelectionMethods as readonly string[]).includes(value);
}

/** How a holding is named in an overrides map: the security, not the account it sits in. */
export function holdingSelectionKey(input: { symbol: string; exchange: string }) {
  return `${input.symbol}:${input.exchange}`.toUpperCase();
}

export function methodForHolding(selection: ParcelSelection, holding: { symbol: string; exchange: string }) {
  return selection.overrides?.[holdingSelectionKey(holding)] ?? selection.method;
}

/**
 * Orders parcels for a disposal to consume.
 *
 * `taxableGainPerUnit` is what the gain-based methods sort on, and it is the *taxable* gain rather
 * than the gross one, which is what the names promise: a parcel held over twelve months is
 * discounted, so it can be the better one to sell even where its gross gain is larger. Where every
 * parcel comes out the same — a fund in pension phase, whose gains are all exempt — the comparison
 * collapses and acquisition date decides, so a report stays deterministic instead of depending on
 * the order rows came back from storage.
 */
export function orderParcelsForDisposal<T extends SelectableParcel>(
  parcels: T[],
  method: ParcelSelectionMethod,
  taxableGainPerUnit: (parcel: T) => number,
): T[] {
  // Indexed so every comparison can fall back to the order the parcels arrived in, which keeps the
  // sort stable and the output reproducible.
  const indexed = parcels.map((parcel, index) => ({ parcel, index }));
  const byAcquisition = (a: typeof indexed[number], b: typeof indexed[number]) =>
    (a.parcel.acquisitionDate ?? "").localeCompare(b.parcel.acquisitionDate ?? "");
  const byTaxable = (a: typeof indexed[number], b: typeof indexed[number]) =>
    taxableGainPerUnit(a.parcel) - taxableGainPerUnit(b.parcel);

  const comparators: Record<ParcelSelectionMethod, (a: typeof indexed[number], b: typeof indexed[number]) => number> = {
    fifo: (a, b) => byAcquisition(a, b) || a.index - b.index,
    lifo: (a, b) => byAcquisition(b, a) || a.index - b.index,
    minimise_gain: (a, b) => byTaxable(a, b) || byAcquisition(a, b) || a.index - b.index,
    maximise_gain: (a, b) => byTaxable(b, a) || byAcquisition(a, b) || a.index - b.index,
  };

  return indexed.sort(comparators[method]).map((entry) => entry.parcel);
}
