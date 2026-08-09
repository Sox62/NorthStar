export type SortDirection = "asc" | "desc";
export type SortState<Key extends string> = { key: Key; direction: SortDirection };

export function nextSort<Key extends string>(current: SortState<Key>, key: Key, ascendingFirst: readonly Key[] = []): SortState<Key> {
  if (current.key === key) return { key, direction: current.direction === "desc" ? "asc" : "desc" };
  return { key, direction: ascendingFirst.includes(key) ? "asc" : "desc" };
}

export function sortIndicator<Key extends string>(sort: SortState<Key>, key: Key) {
  if (sort.key !== key) return "↕";
  return sort.direction === "desc" ? "↓" : "↑";
}

export function compareText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").toLowerCase().localeCompare((right ?? "").toLowerCase());
}

export function compareNumber(left: number, right: number, direction: SortDirection) {
  const result = right - left;
  return result * (direction === "desc" ? 1 : -1);
}
