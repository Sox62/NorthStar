const CANONICAL_INSTRUMENT_NAMES: Record<string, string> = {
  B: "Barrick Mining Corporation",
};

function normaliseSymbol(value: string) {
  return value.trim().toUpperCase();
}

export function canonicalInstrumentName(symbol: string, name?: string | null) {
  const canonical = CANONICAL_INSTRUMENT_NAMES[normaliseSymbol(symbol)];
  if (canonical) return canonical;
  const trimmed = name?.trim();
  return trimmed || symbol.trim().toUpperCase();
}
