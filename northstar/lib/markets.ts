export type MarketUnit = "oz" | "lb" | "index" | "unit";

export type MarketReading = {
  price: number;
  previousClose: number | null;
  currency: string;
  unit: MarketUnit;
};

export type MarketMove = { percent: number; direction: "up" | "down" | "flat" };

/**
 * A move smaller than this rounds to 0.00% on screen, so it is drawn flat rather than given an
 * arrow the digits do not support.
 */
const FLAT_THRESHOLD_PERCENT = 0.005;

export function dailyMove(price: number | null, previousClose: number | null): MarketMove | null {
  if (!price || !previousClose || previousClose <= 0) return null;
  const percent = ((price - previousClose) / previousClose) * 100;
  if (!Number.isFinite(percent)) return null;
  return { percent, direction: moveDirection(percent) };
}

/**
 * The daily move of a ratio, from both legs' own closes — (a/b) against (aPrev/bPrev). Taking the
 * difference of the two percentages instead would be wrong: a ratio compounds, it does not subtract.
 */
export function ratioMove(numerator: MarketReading | null, denominator: MarketReading | null): MarketMove | null {
  if (!numerator || !denominator) return null;
  if (!numerator.previousClose || !denominator.previousClose) return null;
  if (!numerator.price || !denominator.price) return null;
  const previous = numerator.previousClose / denominator.previousClose;
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return dailyMove(numerator.price / denominator.price, previous);
}

function moveDirection(percent: number): MarketMove["direction"] {
  if (percent > FLAT_THRESHOLD_PERCENT) return "up";
  if (percent < -FLAT_THRESHOLD_PERCENT) return "down";
  return "flat";
}

/** Small prices carry a third decimal: copper moves in fractions of a cent and 2dp hides the day. */
function decimalsFor(price: number) {
  return Math.abs(price) < 10 ? 3 : 2;
}

export function formatMarketPrice(reading: MarketReading | null): string | null {
  if (!reading?.price) return null;
  const decimals = decimalsFor(reading.price);
  const amount = reading.price.toLocaleString("en-AU", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const suffix = reading.unit === "oz" ? "/oz" : reading.unit === "lb" ? "/lb" : "";
  return `${reading.currency} ${amount}${suffix}`;
}

export const MOVE_ARROWS = { up: "▲", down: "▼", flat: "–" } as const;

export function formatMove(move: MarketMove | null): string | null {
  if (!move) return null;
  const magnitude = Math.abs(move.percent).toFixed(2);
  if (move.direction === "flat") return `${MOVE_ARROWS.flat} 0.00%`;
  return `${MOVE_ARROWS[move.direction]} ${magnitude}%`;
}

/** Spoken form for the tile's accessible label, since an arrow glyph reads as nothing useful. */
export function describeMove(move: MarketMove | null): string {
  if (!move) return "daily move unavailable";
  if (move.direction === "flat") return "unchanged on the day";
  return `${move.direction} ${Math.abs(move.percent).toFixed(2)}% on the day`;
}
