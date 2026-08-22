import type { BenchmarkNode } from "./benchmark-tree";

export type SelectionKind = "holding" | "benchmark";

export type Selection = { kind: SelectionKind; id: string } | null;

export function selectionValue(kind: SelectionKind, id: string) {
  return id ? `${kind}:${id}` : "";
}

/**
 * Benchmark ids are themselves namespaced with a colon — "reserve:gold",
 * "commodity:platinum" — so only the first separator delimits the kind. Splitting on every
 * colon truncates the id to its namespace, the node lookup misses, and the selection silently
 * falls back to a holding.
 */
export function parseSelectionValue(value: string): Selection {
  const separator = value.indexOf(":");
  if (separator < 1) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id) return null;
  if (kind !== "holding" && kind !== "benchmark") return null;
  return { kind, id };
}

/**
 * Turns typed input into a chartable node. Accepts "XLE", "AMEX:XLE" or "asx:bhp" — the venue is
 * kept when given because it decides both the TradingView symbol and the price-store exchange.
 * Returns null for anything that cannot be a ticker, so the caller can leave the pair untouched.
 */
export function customBenchmarkNode(input: string): BenchmarkNode | null {
  const raw = input.trim().toUpperCase();
  if (!raw) return null;
  // Do not drop empty parts: "AMEX:" would collapse to ["AMEX"] and chart the venue as a ticker.
  const parts = raw.split(":").map((part) => part.trim());
  if (parts.length > 2 || parts.some((part) => !part)) return null;

  const [first, second] = parts;
  const venue = second ? first : "";
  const symbol = second ?? first;
  if (!/^[A-Z0-9][A-Z0-9._-]{0,15}$/.test(symbol)) return null;
  if (venue && !/^[A-Z0-9_]{2,12}$/.test(venue)) return null;

  return {
    id: `custom:${venue}:${symbol}`,
    label: venue ? `${symbol} · ${venue}` : symbol,
    role: "leader",
    symbol,
    tradingViewSymbol: venue ? `${venue}:${symbol}` : symbol,
    basisCurrency: "USD",
    note: "Typed comparison. Backfill history to chart the ratio in SouthernStar.",
  };
}
