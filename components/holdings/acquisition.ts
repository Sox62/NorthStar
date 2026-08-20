export type OpenLotRow = {
  id: string;
  ownerType: string;
  symbol: string;
  acquisitionDate: string | null;
  quantity: number;
};

export type Acquisition = {
  /** When the position was first established: the earliest lot still open. */
  firstAcquired: string;
  /** How many open lots the holding is built from, so a single date does not imply a single buy. */
  lots: number;
};

/**
 * Open lots carry an id of "<holdingId>:<lotId>", which is the only exact link back to a position.
 * Symbol alone would merge the same ticker held in both legal books, and those were bought on
 * different days at different prices.
 */
function holdingIdFromLot(lotId: string) {
  const separator = lotId.indexOf(":");
  return separator > 0 ? lotId.slice(0, separator) : "";
}

/** Fallback key for lots whose id no longer matches a holding — the same ticker in one book. */
export function ownerSymbolKey(ownerType: string, symbol: string) {
  return `${ownerType.trim().toUpperCase()}:${symbol.trim().toUpperCase()}`;
}

/**
 * Earliest open acquisition per holding, indexed both ways so the caller can match on id first and
 * fall back to owner and symbol. Lots with no acquisition date are counted but cannot date the
 * holding: those are the fallback lots the tax page reconstructs from cost basis when no trade
 * history exists, and treating them as "acquired today" would be a lie with tax consequences.
 */
export function acquisitionsByHolding(lots: OpenLotRow[]) {
  const byId = new Map<string, Acquisition>();
  const byOwnerSymbol = new Map<string, Acquisition>();

  const record = (map: Map<string, Acquisition>, key: string, date: string | null) => {
    if (!key) return;
    const current = map.get(key);
    if (!current) {
      map.set(key, { firstAcquired: date ?? "", lots: 1 });
      return;
    }
    current.lots += 1;
    if (date && (!current.firstAcquired || date < current.firstAcquired)) current.firstAcquired = date;
  };

  for (const lot of lots) {
    record(byId, holdingIdFromLot(lot.id), lot.acquisitionDate);
    record(byOwnerSymbol, ownerSymbolKey(lot.ownerType, lot.symbol), lot.acquisitionDate);
  }

  return { byId, byOwnerSymbol };
}

/** Days held, for the "held since" note. Null when the holding has no dated lot. */
export function heldDays(firstAcquired: string, now = new Date()) {
  if (!firstAcquired) return null;
  const start = new Date(`${firstAcquired.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const days = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return days >= 0 ? days : null;
}

/** Whole years where the holding is old enough for one, otherwise months. */
export function heldLabel(firstAcquired: string, now = new Date()) {
  const days = heldDays(firstAcquired, now);
  if (days == null) return "";
  if (days >= 365) {
    const years = days / 365;
    return `${years.toLocaleString("en-AU", { maximumFractionDigits: 1 })} yr held`;
  }
  const months = Math.max(0, Math.round(days / 30));
  return months <= 1 ? `${days} days held` : `${months} mo held`;
}
