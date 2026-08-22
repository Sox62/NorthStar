import type { Holding } from "../types";

/** Sample holdings for local dev / Storybook. Replace with your DB / IBKR feed.
 *  Both books present so the Personal / SMSF separation is exercised. */
export const sampleHoldings: Holding[] = [
  { id: "1", symbol: "PDN", name: "Paladin Energy", ownerType: "SMSF", sector: "Uranium miners", units: 9000, costAud: 35760, marketValueAud: 67461, pnlAud: 31701, pnlPercent: 88.7, valuationBasis: "market" },
  { id: "2", symbol: "CDE", name: "Coeur Mining", ownerType: "PERSONAL", sector: "Silver miners", units: 4200, costAud: 35350, marketValueAud: 59387, pnlAud: 24037, pnlPercent: 68.0, valuationBasis: "market" },
  { id: "3", symbol: "SILJ", name: "Silver Miners Juniors ETF", ownerType: "PERSONAL", sector: "Silver miners", units: 3800, costAud: 38940, marketValueAud: 59075, pnlAud: 20135, pnlPercent: 51.7, valuationBasis: "market" },
  { id: "4", symbol: "URNM", name: "Betashares Uranium ETF", ownerType: "SMSF", sector: "Uranium miners", units: 2100, costAud: 52745, marketValueAud: 55909, pnlAud: 3164, pnlPercent: 6.0, valuationBasis: "market" },
  { id: "5", symbol: "SVM", name: "Silvercorp Metals", ownerType: "PERSONAL", sector: "Silver miners", units: 12500, costAud: 21444, marketValueAud: 46983, pnlAud: 25539, pnlPercent: 119.1, valuationBasis: "market" },
  { id: "6", symbol: "XRH0", name: "Physical Rhodium ETF", ownerType: "PERSONAL", sector: "Rhodium metal", units: 40, costAud: 32920, marketValueAud: 44772, pnlAud: 11852, pnlPercent: 36.0, valuationBasis: "market" },
  { id: "7", symbol: "SIL", name: "Silver Miners ETF", ownerType: "SMSF", sector: "Silver miners", units: 900, costAud: 25293, marketValueAud: 43909, pnlAud: 18616, pnlPercent: 73.6, valuationBasis: "market" },
  { id: "8", symbol: "BMN", name: "Bannerman Energy", ownerType: "SMSF", sector: "Uranium miners", units: 11000, costAud: 29948, marketValueAud: 40040, pnlAud: 10092, pnlPercent: 33.7, valuationBasis: "market" },
  { id: "9", symbol: "PLAT", name: "Physical platinum (1 kg tablet)", ownerType: "PERSONAL", sector: "Platinum bullion", units: 4.2, costAud: 194100, marketValueAud: 246655, pnlAud: 52555, pnlPercent: 27.1, valuationBasis: "market" },
  { id: "10", symbol: "WRN", name: "Western Copper & Gold", ownerType: "SMSF", sector: "Gold miners", units: 15000, costAud: 22200, marketValueAud: 33585, pnlAud: 11385, pnlPercent: 51.3, valuationBasis: "market" },
  { id: "11", symbol: "VAU", name: "Vault Mining", ownerType: "PERSONAL", sector: "Gold miners", units: 60000, costAud: 20033, marketValueAud: 31772, pnlAud: 11739, pnlPercent: 58.6, valuationBasis: "market" },
  { id: "12", symbol: "XOM", name: "Exxon Mobil", ownerType: "PERSONAL", sector: "Oil", units: 220, costAud: 19780, marketValueAud: 22352, pnlAud: 2572, pnlPercent: 13.0, valuationBasis: "market" },
  { id: "13", symbol: "ETPMAG", name: "Silver Physical ETF", ownerType: "SMSF", sector: "Silver bullion", units: 400, costAud: 4640, marketValueAud: 11205, pnlAud: 6565, pnlPercent: 141.5, valuationBasis: "market" },
  { id: "14", symbol: "CASH", name: "AUD cash reserve", ownerType: "SMSF", sector: "Cash", units: 5000, costAud: 5000, marketValueAud: 5000, pnlAud: 0, pnlPercent: 0, valuationBasis: "cost_basis" },
];
