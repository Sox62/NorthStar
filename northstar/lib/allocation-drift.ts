import { SECTOR_COLORS, type Sector } from "../types";

export type SectorValue = {
  sector: Sector;
  value: number;
};

export type AllocationDriftSummary = {
  sector: Sector;
  currentValue: number;
  targetValue: number;
  currentPercent: number;
  targetPercent: number;
  driftPercent: number;
  valueToTarget: number;
  color: string;
};

export const targetAllocation: Record<Sector, number> = {
  "Silver miners": 30,
  "Gold miners": 20,
  "Uranium miners": 20,
  "Platinum bullion": 20,
  "Rhodium metal": 4,
  "Silver bullion": 2,
  Oil: 2,
  Cash: 2,
};

function pct(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

export function allocationDriftForSectors(sectors: SectorValue[], total: number): AllocationDriftSummary[] {
  const current = new Map<Sector, number>(sectors.map((item) => [item.sector, item.value]));
  return (Object.keys(targetAllocation) as Sector[]).map((sector) => {
    const currentValue = current.get(sector) ?? 0;
    const targetPercent = targetAllocation[sector];
    const targetValue = total * targetPercent / 100;
    const currentPercent = pct(currentValue, total);
    return {
      sector,
      currentValue,
      targetValue,
      currentPercent,
      targetPercent,
      driftPercent: currentPercent - targetPercent,
      valueToTarget: targetValue - currentValue,
      color: SECTOR_COLORS[sector],
    };
  }).sort((a, b) => Math.abs(b.driftPercent) - Math.abs(a.driftPercent));
}
