import { SECTOR_COLORS, type Sector } from "../types";
import { classifyAsset } from "@/lib/storage/classify";

type SectorInput = {
  symbol: string;
  name: string;
  assetClass: string;
};

export function sectorForInstrument(position: SectorInput): Sector {
  return classifyAsset(position.symbol, `${position.name} ${position.assetClass}`);
}

const sectorNames = new Set<string>(Object.keys(SECTOR_COLORS));

function isSector(value: string): value is Sector {
  return sectorNames.has(value);
}

/**
 * Use for holdings returned by the dashboard API, where assetClass has already had user sector
 * overrides applied. Re-running the classifier here would let stale symbol defaults beat saved
 * research decisions such as SMR = Coal.
 */
export function recordedSectorForInstrument(position: SectorInput): Sector {
  const recorded = position.assetClass.trim();
  return isSector(recorded) ? recorded : sectorForInstrument(position);
}
