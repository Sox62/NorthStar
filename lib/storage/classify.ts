import type { Sector } from "@/northstar/types";

const SYMBOL_SECTORS: Record<string, Sector> = {
  ASL: "Silver miners",
  AYA: "Silver miners",
  CDE: "Silver miners",
  EDR: "Silver miners",
  HL: "Silver miners",
  MAG: "Silver miners",
  PAAS: "Silver miners",
  SCZ: "Silver miners",
  SIL: "Silver miners",
  SILJ: "Silver miners",
  SLVM: "Silver miners",
  SVM: "Silver miners",

  B: "Gold miners",
  GGP: "Gold miners",
  GDX: "Gold miners",
  NEM: "Gold miners",
  HSTR: "Gold miners",
  NST: "Gold miners",
  RRL: "Gold miners",
  VAU: "Gold miners",
  WRN: "Gold miners",

  ATOM: "Uranium miners",
  BMN: "Uranium miners",
  CCJ: "Uranium miners",
  EU: "Uranium miners",
  DML: "Uranium miners",
  DYL: "Uranium miners",
  NXG: "Uranium miners",
  NUKZ: "Uranium miners",
  PDN: "Uranium miners",
  U: "Uranium miners",
  "U.UN": "Uranium miners",
  URA: "Uranium miners",
  URNM: "Uranium miners",
  UUUU: "Uranium miners",

  LAM: "Uranium explorers",

  VELO: "Technology",

  DBA: "Soft commodities",

  EC: "Oil",
  XOP: "Oil",
  XOM: "Oil",


  ETPMAG: "Silver bullion",
  PLATINUM: "Platinum bullion",
  XRH0: "Rhodium metal",
  CASH: "Cash",
};

function normaliseSymbol(value: string) {
  return value.trim().toUpperCase();
}

/**
 * A user override always wins. The built-in map and the keyword rules only ever see a ticker and
 * a name, so anything they cannot recognise falls to "Broad equities" until someone says
 * otherwise — and saying otherwise should not require a deploy.
 */
export function classifyAsset(symbol: string, name: string, overrides?: Record<string, Sector>): Sector {
  const normalisedSymbol = normaliseSymbol(symbol);
  const override = overrides?.[normalisedSymbol];
  if (override) return override;
  const mapped = SYMBOL_SECTORS[normalisedSymbol];
  if (mapped) return mapped;

  const text = `${symbol} ${name}`.toUpperCase();
  if (/CASH/.test(text)) return "Cash";
  if (/PLATINUM|PHYSICAL PLAT/.test(text)) return "Platinum bullion";
  if (/RHODIUM|XRH/.test(text)) return "Rhodium metal";
  if (/SILVER BULLION|SILVER PHYSICAL|ETPMAG|BULLION/.test(text)) return "Silver bullion";
  if (/VELO|VELOCITY|TECH|SOFTWARE|DIGITAL|SEMICONDUCTOR/.test(text)) return "Technology";
  if (/LARAMIDE|U3O8|U308|URANIUM EXPLOR/.test(text)) return "Uranium explorers";
  if (/URANIUM|NUCLEAR|PALADIN|BANNERMAN|ENCORE/.test(text)) return "Uranium miners";
  if (/SILVER|COEUR|HECLA/.test(text)) return "Silver miners";
  if (/GOLD|BARRICK|VAULT|WESTERN COPPER/.test(text)) return "Gold miners";
  if (/COPPER|CUPRIC/.test(text)) return "Copper miners";
  if (/\bCOAL\b|COKING|THERMAL COAL|WHITEHAVEN|PEABODY/.test(text)) return "Coal";
  if (/AGRICULTUR|WHEAT|CORN|SOYBEAN|SUGAR|COTTON|COFFEE|LIVESTOCK/.test(text)) return "Soft commodities";
  if (/OIL|ENERGY|EXXON|ECOPETROL|PETROL/.test(text)) return "Oil";
  return "Broad equities";
}
