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
