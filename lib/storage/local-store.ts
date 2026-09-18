import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultAllocationTargets, normaliseAllocationTargets } from "@/southernstar/lib/allocation-drift";
import type {
  AllocationTarget,
  CompositeIndexResult,
  FundamentalResearchDraft,
  LocalStore,
  ManualAsset,
  MinerFundamentals,
  OwnerType,
  PlatinumPrice,
  PositionRiskPlan,
  RiskSnapshot,
  SectorOverride,
  StoredDailyPrice,
  StoredFxRate,
  StoredOpenOrder,
  StructuralLevel,
  SyncRun,
} from "./types";

const DATA_FILE = process.env.NORTH_STAR_DATA_FILE || path.join(/*turbopackIgnore: true*/ process.cwd(), ".southern-star", "data.json");
const LEGACY_DATA_FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), ".north-star", "data.json");
const EMPTY: LocalStore = { version: 7, transactions: [], positions: [], openOrders: [], riskPlans: [], riskSnapshots: [], cashAccounts: [], manualAssets: [], platinumPrices: [], dailyPrices: [], fxRates: [], snapshots: [], syncRuns: [], allocationTargets: defaultAllocationTargets(), sectorOverrides: [], minerFundamentals: [], fundamentalResearchDrafts: [], structuralLevels: [], compositeIndexResults: [], imports: [] };

function normalisePhysicalMetalType(value: unknown) {
  return value === "GOLD" || value === "SILVER" || value === "PLATINUM" || value === "PALLADIUM" ? value : "PLATINUM";
}

async function parseStoreFile(file: string): Promise<LocalStore> {
  const parsed = JSON.parse(await readFile(/*turbopackIgnore: true*/ file, "utf8")) as Record<string, unknown>;
  if (parsed.version === 7) {
    return {
      ...(parsed as unknown as LocalStore),
      platinumPrices: (parsed.platinumPrices as PlatinumPrice[] | undefined) ?? [],
      openOrders: (parsed.openOrders as StoredOpenOrder[] | undefined) ?? [],
      riskPlans: (parsed.riskPlans as PositionRiskPlan[] | undefined) ?? [],
      riskSnapshots: (parsed.riskSnapshots as RiskSnapshot[] | undefined) ?? [],
      dailyPrices: (parsed.dailyPrices as StoredDailyPrice[] | undefined) ?? [],
      fxRates: (parsed.fxRates as StoredFxRate[] | undefined) ?? [],
      syncRuns: (parsed.syncRuns as SyncRun[] | undefined) ?? [],
      allocationTargets: normaliseAllocationTargets((parsed.allocationTargets as AllocationTarget[] | undefined) ?? []),
      sectorOverrides: (parsed.sectorOverrides as SectorOverride[] | undefined) ?? [],
      minerFundamentals: (parsed.minerFundamentals as MinerFundamentals[] | undefined) ?? [],
      fundamentalResearchDrafts: (parsed.fundamentalResearchDrafts as FundamentalResearchDraft[] | undefined) ?? [],
      structuralLevels: (parsed.structuralLevels as StructuralLevel[] | undefined) ?? [],
      compositeIndexResults: (parsed.compositeIndexResults as CompositeIndexResult[] | undefined) ?? [],
    };
  }
  if (parsed.version === 6) {
    return {
      ...(parsed as unknown as Omit<LocalStore, "version" | "compositeIndexResults">),
      version: 7,
      platinumPrices: (parsed.platinumPrices as PlatinumPrice[] | undefined) ?? [],
      openOrders: (parsed.openOrders as StoredOpenOrder[] | undefined) ?? [],
      riskPlans: (parsed.riskPlans as PositionRiskPlan[] | undefined) ?? [],
      riskSnapshots: (parsed.riskSnapshots as RiskSnapshot[] | undefined) ?? [],
      dailyPrices: (parsed.dailyPrices as StoredDailyPrice[] | undefined) ?? [],
      fxRates: (parsed.fxRates as StoredFxRate[] | undefined) ?? [],
      syncRuns: (parsed.syncRuns as SyncRun[] | undefined) ?? [],
      allocationTargets: normaliseAllocationTargets((parsed.allocationTargets as AllocationTarget[] | undefined) ?? []),
      sectorOverrides: (parsed.sectorOverrides as SectorOverride[] | undefined) ?? [],
      minerFundamentals: (parsed.minerFundamentals as MinerFundamentals[] | undefined) ?? [],
      fundamentalResearchDrafts: (parsed.fundamentalResearchDrafts as FundamentalResearchDraft[] | undefined) ?? [],
      structuralLevels: (parsed.structuralLevels as StructuralLevel[] | undefined) ?? [],
      compositeIndexResults: [],
    };
  }
  if (parsed.version === 5) {
    return {
      ...(parsed as unknown as Omit<LocalStore, "version" | "dailyPrices" | "fxRates">),
      version: 7,
      platinumPrices: (parsed.platinumPrices as PlatinumPrice[] | undefined) ?? [],
      openOrders: (parsed.openOrders as StoredOpenOrder[] | undefined) ?? [],
      riskPlans: (parsed.riskPlans as PositionRiskPlan[] | undefined) ?? [],
      riskSnapshots: (parsed.riskSnapshots as RiskSnapshot[] | undefined) ?? [],
      dailyPrices: [],
      fxRates: [],
      syncRuns: (parsed.syncRuns as SyncRun[] | undefined) ?? [],
      allocationTargets: normaliseAllocationTargets((parsed.allocationTargets as AllocationTarget[] | undefined) ?? []),
      minerFundamentals: (parsed.minerFundamentals as MinerFundamentals[] | undefined) ?? [],
      fundamentalResearchDrafts: (parsed.fundamentalResearchDrafts as FundamentalResearchDraft[] | undefined) ?? [],
      structuralLevels: (parsed.structuralLevels as StructuralLevel[] | undefined) ?? [],
      compositeIndexResults: [],
    };
  }
  if (parsed.version === 4) {
    return {
      ...(parsed as unknown as Omit<LocalStore, "version" | "syncRuns">),
      version: 7,
      platinumPrices: (parsed.platinumPrices as PlatinumPrice[] | undefined) ?? [],
      openOrders: [],
      riskPlans: [],
      riskSnapshots: [],
      dailyPrices: [],
      fxRates: [],
      syncRuns: [],
      allocationTargets: defaultAllocationTargets(),
      minerFundamentals: [],
      fundamentalResearchDrafts: [],
      structuralLevels: [],
      compositeIndexResults: [],
    };
  }
  if (parsed.version === 3) {
    const legacyAssets = (parsed.manualAssets as Array<Record<string, unknown>> | undefined) ?? [];
    const manualAssets: ManualAsset[] = legacyAssets.map(asset => {
      const quantityTroyOz = Number(asset.quantityTroyOz ?? 0);
      const quantityKg = quantityTroyOz / 32.1507465686;
      const totalCostAud = Number(asset.totalCostAud ?? 0);
      const buybackAudPerKg = Number(asset.currentPriceAudPerOz ?? 0) * 32.1507465686;
      const marketValueAud = quantityKg * buybackAudPerKg;
      const pnlAud = marketValueAud - totalCostAud;
      return {
        id: String(asset.id), ownerType: asset.ownerType as OwnerType, assetType: normalisePhysicalMetalType(asset.assetType), name: String(asset.name ?? "Physical platinum"),
        quantityKg, totalCostAud, costAudPerKg: quantityKg ? totalCostAud / quantityKg : 0,
        buybackAudPerKg, retailAudPerKg: buybackAudPerKg, marketValueAud, pnlAud,
        pnlPercent: totalCostAud ? pnlAud / totalCostAud * 100 : 0,
        dealerSpreadAudPerKg: 0, dealerSpreadPercent: 0, priceProvider: "Legacy manual price",
        priceSourceUrl: "", purchaseDate: String(asset.purchaseDate), asOfDate: String(asset.asOfDate),
        priceRetrievedAt: String(asset.updatedAt ?? new Date().toISOString()), updatedAt: String(asset.updatedAt ?? new Date().toISOString()),
      };
    });
    return { ...(parsed as unknown as Omit<LocalStore, "version" | "manualAssets" | "platinumPrices" | "dailyPrices" | "fxRates" | "syncRuns" | "allocationTargets" | "compositeIndexResults">), version: 7, manualAssets, platinumPrices: [], openOrders: [], riskPlans: [], riskSnapshots: [], dailyPrices: [], fxRates: [], syncRuns: [], allocationTargets: defaultAllocationTargets(), sectorOverrides: [], minerFundamentals: [], fundamentalResearchDrafts: [], structuralLevels: [], compositeIndexResults: [] };
  }
  if (parsed.version === 2) {
    return { ...(parsed as unknown as Omit<LocalStore, "version" | "manualAssets" | "platinumPrices" | "dailyPrices" | "fxRates" | "syncRuns" | "allocationTargets" | "compositeIndexResults">), version: 7, manualAssets: [], platinumPrices: [], openOrders: [], riskPlans: [], riskSnapshots: [], dailyPrices: [], fxRates: [], syncRuns: [], allocationTargets: defaultAllocationTargets(), sectorOverrides: [], minerFundamentals: [], fundamentalResearchDrafts: [], structuralLevels: [], compositeIndexResults: [] };
  }
  return structuredClone(EMPTY);
}

export async function readStore(): Promise<LocalStore> {
  try {
    return await parseStoreFile(DATA_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && DATA_FILE !== LEGACY_DATA_FILE) {
      try {
        return await parseStoreFile(LEGACY_DATA_FILE);
      } catch (legacyError) {
        if ((legacyError as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
        throw legacyError;
      }
    }
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
    throw error;
  }
}

export async function writeStore(store: LocalStore) {
  await mkdir(path.dirname(/*turbopackIgnore: true*/ DATA_FILE), { recursive: true });
  const temporary = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(/*turbopackIgnore: true*/ temporary, JSON.stringify(store, null, 2), "utf8");
  await rename(/*turbopackIgnore: true*/ temporary, /*turbopackIgnore: true*/ DATA_FILE);
}
