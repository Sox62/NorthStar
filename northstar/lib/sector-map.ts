import type { Sector } from "../types";

type SectorInput = {
  symbol: string;
  name: string;
  assetClass: string;
};

const symbolSector: Record<string, Sector> = {
  PDN: "Uranium miners",
  BMN: "Uranium miners",
  URNM: "Uranium miners",
  URA: "Uranium miners",
  UUUU: "Uranium miners",
  CCJ: "Uranium miners",
  DML: "Uranium miners",
  DYL: "Uranium miners",
  NXG: "Uranium miners",
  NUKZ: "Uranium miners",
  CDE: "Silver miners",
  SILJ: "Silver miners",
  SIL: "Silver miners",
  SVM: "Silver miners",
  PAAS: "Silver miners",
  HL: "Silver miners",
  AG: "Silver miners",
  MAG: "Silver miners",
  AYA: "Silver miners",
  EDR: "Silver miners",
  SCZ: "Silver miners",
  WRN: "Gold miners",
  VAU: "Gold miners",
  NEM: "Gold miners",
  GDX: "Gold miners",
  NST: "Gold miners",
  RRL: "Gold miners",
  XOM: "Oil",
  EC: "Oil",
  ETPMAG: "Silver bullion",
  XRH0: "Rhodium metal",
  PLATINUM: "Platinum bullion",
  CASH: "Cash",
};

export function sectorForInstrument(position: SectorInput): Sector {
  const symbol = position.symbol.toUpperCase();
  const text = `${position.symbol} ${position.name} ${position.assetClass}`.toUpperCase();
  if (symbolSector[symbol]) return symbolSector[symbol];
  if (/PLATINUM|PHYSICAL PLAT/.test(text)) return "Platinum bullion";
  if (/RHODIUM|XRH/.test(text)) return "Rhodium metal";
  if (/SILVER BULLION|SILVER PHYSICAL|ETPMAG|BULLION/.test(text)) return "Silver bullion";
  if (/SILVER|SILJ|SIL|SVM|COEUR|HECLA/.test(text)) return "Silver miners";
  if (/GOLD|VAULT|WESTERN COPPER/.test(text)) return "Gold miners";
  if (/URANIUM|NUCLEAR|PALADIN|BANNERMAN|URA|URNM|UUUU|CCJ|DML|DYL|NXG|NUKZ/.test(text)) return "Uranium miners";
  if (/OIL|ENERGY|EXXON|ECOPETROL|PETROL/.test(text)) return "Oil";
  if (/CASH/.test(text)) return "Cash";
  return position.assetClass === "Energy" ? "Oil" : "Gold miners";
}
