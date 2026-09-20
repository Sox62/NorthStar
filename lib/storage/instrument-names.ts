const CANONICAL_INSTRUMENT_NAMES: Record<string, string> = {
  AG: "First Majestic Silver",
  ASL: "Andean Silver",
  ASM: "Avino Silver & Gold Mines",
  ATOM: "Global X Uranium ETF",
  AYA: "Aya Gold & Silver",
  B: "Barrick Mining Corporation",
  BMN: "Bannerman Energy",
  CCJ: "Cameco",
  CDE: "Coeur Mining",
  DML: "Denison Mines",
  DYL: "Deep Yellow",
  EDR: "Endeavour Silver Corp",
  ETPMAG: "Global X Physical Silver",
  EU: "enCore Energy",
  GDX: "VanEck Gold Miners ETF",
  GGP: "Greatland Resources",
  HL: "Hecla",
  HSTR: "Heliostar Metals",
  KGC: "Kinross Gold",
  LAM: "Laramide",
  MAG: "MAG Silver",
  NEM: "Newmont",
  NST: "Northern Star Resources",
  NUKZ: "Range Nuclear Renaissance Index ETF",
  NXG: "NexGen Energy",
  PAAS: "Pan American Silver",
  PDN: "Paladin Energy",
  PMGOLD: "Perth Mint Gold",
  RRL: "Regis Resources",
  SCZ: "Santacruz Silver Mining",
  SIL: "Global X Silver Miners ETF",
  SILJ: "Amplify Junior Silver Miners ETF",
  SLVM: "Global X Silver Miners ETF",
  SVM: "Silvercorp Metals",
  U: "Sprott Physical Uranium Trust",
  "U.UN": "Sprott Physical Uranium Trust",
  URA: "Global X Uranium ETF",
  URNM: "BetaShares Global Uranium ETF",
  UUUU: "Energy Fuels",
  VAU: "Vault Minerals",
  WRN: "Western Copper & Gold",
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
