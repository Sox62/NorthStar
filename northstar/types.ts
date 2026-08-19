// SouthernStar shared domain types — data-driven, owner-aware.
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
  | "Uranium explorers"
  | "Technology"
  | "Copper miners"
  | "Coal"
  | "Soft commodities"
  | "Broad equities"
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
  dayGainAud?: number;
  pnlAud: number;
  pnlPercent: number;
  valuationBasis: "market" | "cost_basis";
  lastPrice?: number | null;
  priceCurrency?: string;
  priceAsOfDate?: string | null;
  exchange?: string;
  /** Where the position is held — "IBKR", "Directshares", or "Physical" for manual metal. */
  broker?: string;
  /** Stable broker account/feed key, used to separate Personal IBKR from Personal Directshares. */
  accountKey?: string;
  /** Optional display label for the broker account/feed. */
  accountLabel?: string;
}

/** Sector colour palette — keep tags, donut and value bars consistent. */
export const SECTOR_COLORS: Record<Sector, string> = {
  "Silver miners": "#b9c4d0",
  "Gold miners": "#d7b56d",
  "Uranium miners": "#8dc6a0",
  "Uranium explorers": "#5fbf8f",
  Technology: "#77a9d8",
  "Copper miners": "#b87333",
  Coal: "#6f7b86",
  "Soft commodities": "#b5c88f",
  "Broad equities": "#9aa9ba",
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
  "Uranium explorers": "miners",
  Technology: "other",
  "Copper miners": "miners",
  Coal: "miners",
  "Soft commodities": "other",
  "Broad equities": "other",
  "Platinum bullion": "metals",
  "Rhodium metal": "metals",
  "Silver bullion": "metals",
  Oil: "other",
  Cash: "other",
};
