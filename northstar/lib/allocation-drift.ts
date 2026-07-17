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

export type AllocationTarget = {
  sector: Sector;
  targetPercent: number;
  updatedAt: string | null;
};

export const defaultTargetAllocation: Record<Sector, number> = {
  "Silver miners": 30,
  "Gold miners": 20,
  "Uranium miners": 20,
  "Uranium explorers": 0,
  Technology: 0,
  "Platinum bullion": 20,
  "Rhodium metal": 4,
  "Silver bullion": 2,
  Oil: 2,
  Cash: 2,
};

export function defaultAllocationTargets(): AllocationTarget[] {
  return (Object.keys(defaultTargetAllocation) as Sector[]).map((sector) => ({
    sector,
    targetPercent: defaultTargetAllocation[sector],
    updatedAt: null,
  }));
}

export function normaliseAllocationTargets(targets: AllocationTarget[] = []): AllocationTarget[] {
  const merged = new Map<Sector, AllocationTarget>(defaultAllocationTargets().map((target) => [target.sector, target]));
  for (const target of targets) {
    if (target.sector in defaultTargetAllocation && Number.isFinite(target.targetPercent)) {
      merged.set(target.sector, { ...target, targetPercent: Math.max(0, target.targetPercent) });
    }
  }
  return [...merged.values()];
}

function pct(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

export function allocationDriftForSectors(sectors: SectorValue[], total: number, targets?: AllocationTarget[]): AllocationDriftSummary[] {
  const current = new Map<Sector, number>(sectors.map((item) => [item.sector, item.value]));
  const targetMap = new Map<Sector, number>(normaliseAllocationTargets(targets).map((target) => [target.sector, target.targetPercent]));
  return (Object.keys(defaultTargetAllocation) as Sector[]).map((sector) => {
    const currentValue = current.get(sector) ?? 0;
    const targetPercent = targetMap.get(sector) ?? defaultTargetAllocation[sector];
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
