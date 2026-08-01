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
  GDX: "Gold miners",
  NEM: "Gold miners",
  NST: "Gold miners",
  RRL: "Gold miners",
  VAU: "Gold miners",
  WRN: "Gold miners",

  ATOM: "Uranium miners",
  BMN: "Uranium miners",
  CCJ: "Uranium miners",
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

  EC: "Oil",
  XOM: "Oil",

  DBA: "Broad equities",

  ETPMAG: "Silver bullion",
  PLATINUM: "Platinum bullion",
  XRH0: "Rhodium metal",
  CASH: "Cash",
};

function normaliseSymbol(value: string) {
  return value.trim().toUpperCase();
}

export function classifyAsset(symbol: string, name: string): Sector {
  const normalisedSymbol = normaliseSymbol(symbol);
  const mapped = SYMBOL_SECTORS[normalisedSymbol];
  if (mapped) return mapped;

  const text = `${symbol} ${name}`.toUpperCase();
  if (/CASH/.test(text)) return "Cash";
  if (/PLATINUM|PHYSICAL PLAT/.test(text)) return "Platinum bullion";
  if (/RHODIUM|XRH/.test(text)) return "Rhodium metal";
  if (/SILVER BULLION|SILVER PHYSICAL|ETPMAG|BULLION/.test(text)) return "Silver bullion";
  if (/VELO|VELOCITY|TECH|SOFTWARE|DIGITAL|SEMICONDUCTOR/.test(text)) return "Technology";
  if (/LARAMIDE|U3O8|U308|URANIUM EXPLOR/.test(text)) return "Uranium explorers";
  if (/URANIUM|NUCLEAR|PALADIN|BANNERMAN/.test(text)) return "Uranium miners";
  if (/SILVER|COEUR|HECLA/.test(text)) return "Silver miners";
  if (/GOLD|BARRICK|VAULT|WESTERN COPPER/.test(text)) return "Gold miners";
  if (/OIL|ENERGY|EXXON|ECOPETROL|PETROL/.test(text)) return "Oil";
  return "Broad equities";
}
