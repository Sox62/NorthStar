import type { DashboardData, DashboardHolding, OwnerType, Scope } from "@/lib/storage";
import type { Holding, Sector } from "@/northstar/types";

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

function ownerFromScope(scope: Scope): OwnerType {
  return scope === "smsf" ? "SMSF" : "PERSONAL";
}

function sectorFor(position: DashboardHolding): Sector {
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

function cashHolding(data: DashboardData): Holding | null {
  if (data.scope === "overall" || data.cashValue <= 0) return null;
  const ownerType = ownerFromScope(data.scope);
  const ownerLabel = ownerType === "SMSF" ? "SMSF" : "Personal";
  return {
    id: `cash-${data.scope}`,
    symbol: "CASH",
    name: `${ownerLabel} cash reserve`,
    ownerType,
    sector: "Cash",
    units: data.cashValue,
    costAud: 0,
    marketValueAud: data.cashValue,
    pnlAud: 0,
    pnlPercent: 0,
    valuationBasis: "market",
  };
}

export function dashboardToNorthstarHoldings(data: DashboardData): Holding[] {
  const holdings = data.holdings.map((position): Holding => ({
    id: position.id,
    symbol: position.symbol,
    name: position.name,
    ownerType: position.ownerType,
    sector: sectorFor(position),
    units: position.quantity,
    costAud: position.costAud,
    marketValueAud: position.marketValueAud,
    pnlAud: position.pnlAud,
    pnlPercent: position.pnlPercent,
    valuationBasis: position.valuationBasis,
  }));

  const cash = cashHolding(data);
  if (cash) holdings.push(cash);
  return holdings;
}
