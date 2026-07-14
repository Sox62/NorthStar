// NorthStar shared domain types — data-driven, owner-aware.
// Holdings are supplied by your app (DB / IBKR feed); nothing here is hardcoded.

/** The two legally-separate books. Every position belongs to exactly one. */
export type OwnerType = "PERSONAL" | "SMSF";

/** The view scope selector on the dashboard. */
export type PortfolioScope = "overall" | "personal" | "smsf";

/** Asset-class / sector bucket used for breakdowns and tag colours. */
export type Sector =
  | "Silver miners"
  | "Gold miners"
  | "Uranium miners"
  | "Platinum bullion"
  | "Rhodium metal"
  | "Silver bullion"
  | "Oil"
  | "Cash";

/** Coarse composition group above sector — the metals/miners split. */
export type CompositionGroup = "miners" | "metals" | "other";

/** A single position. Values are whatever your pricing layer computes now —
 *  they change every sync; this shape does not. */
export interface Holding {
  id: string;
  symbol: string;          // e.g. "PDN"
  name: string;            // e.g. "Paladin Energy"
  ownerType: OwnerType;    // PERSONAL | SMSF — the legal separation
  sector: Sector;
  units: number;
  costAud: number;
  marketValueAud: number;
  pnlAud: number;
  pnlPercent: number;
  valuationBasis: "market" | "cost_basis";
}

/** Sector colour palette — keep tags, donut and value bars consistent. */
export const SECTOR_COLORS: Record<Sector, string> = {
  "Silver miners": "#b9c4d0",
  "Gold miners": "#d7b56d",
  "Uranium miners": "#8dc6a0",
  "Platinum bullion": "#8fa6bf",
  "Rhodium metal": "#c78db8",
  "Silver bullion": "#e3e9f0",
  Oil: "#dd8b6f",
  Cash: "#5d6f81",
};

export const COMPOSITION_OF: Record<Sector, CompositionGroup> = {
  "Silver miners": "miners",
  "Gold miners": "miners",
  "Uranium miners": "miners",
  "Platinum bullion": "metals",
  "Rhodium metal": "metals",
  "Silver bullion": "metals",
  Oil: "other",
  Cash: "other",
};
