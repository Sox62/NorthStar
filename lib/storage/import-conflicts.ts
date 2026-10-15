import type { ImportConflict, StoredTransaction } from "./types";

/** The fields an amendment actually moves. Ids, sources and descriptions are not evidence of one. */
const COMPARED = ["quantity", "price", "cost", "netCash", "fees", "taxes", "fxRateToBase", "tradeDate", "currency"] as const;

const shown = (value: unknown) => value == null ? "—" : String(value);

/** Close enough to be the same number, allowing for the scale a store round-trips through. */
function differs(stored: unknown, incoming: unknown) {
  if (typeof stored === "number" && typeof incoming === "number") return Math.abs(stored - incoming) > 0.0000005;
  return shown(stored) !== shown(incoming);
}

/**
 * What a re-imported row says that its stored copy does not.
 *
 * Returns nothing for an exact repeat, which is the ordinary case and correctly a duplicate.
 */
export function importConflicts(
  stored: Pick<StoredTransaction, "externalId" | "symbol" | "tradeDate"> & Record<string, unknown>,
  incoming: Record<string, unknown>,
): ImportConflict[] {
  return COMPARED
    /*
     * A field the incoming row does not state is not an amendment. Importers leave fields unset or
     * null wherever a source is silent, so judging those would report a conflict on every ordinary
     * re-import. The trade-off is deliberate: an amendment that genuinely clears a value goes
     * unflagged, which is the quieter of the two errors.
     */
    .filter((field) => incoming[field] != null)
    .filter((field) => differs(stored[field], incoming[field]))
    .map((field) => ({
      externalId: stored.externalId,
      symbol: stored.symbol,
      tradeDate: stored.tradeDate,
      field,
      stored: shown(stored[field]),
      incoming: shown(incoming[field]),
    }));
}
