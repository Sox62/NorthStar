import type { Sector } from "../types";
import { classifyAsset } from "@/lib/storage/classify";

type SectorInput = {
  symbol: string;
  name: string;
  assetClass: string;
};

export function sectorForInstrument(position: SectorInput): Sector {
  return classifyAsset(position.symbol, `${position.name} ${position.assetClass}`);
}
