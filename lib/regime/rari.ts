import type { CompositeIndexResult, PriceableInstrument, PriceBook } from "@/lib/storage";
import {
  calculateCompositeIndex,
  compositeScoreChanges,
  filterCompositeRange,
  type CompositeIndexCalculation,
  type CompositeIndexDefinition,
  type CompositeScoringConfig,
} from "./composite-index";

export const RARI_DEFINITION_ID = "rari";
export const RARI_CALCULATION_VERSION = "rari-v1.0.0";

const defaultScoring: CompositeScoringConfig = {
  basis: "raw_market",
  movingAverageDays: 200,
  slopeLookbackDays: 20,
  roc6mDays: 183,
  roc12mDays: 366,
  metricWeights: {
    priceVsMovingAverage: 30,
    movingAverageSlope: 25,
    roc6m: 25,
    roc12m: 20,
  },
  minimumEvidenceWeight: 0.75,
  maxCarryForwardDays: 7,
  staleAfterDays: 10,
};

const macroScoring: CompositeScoringConfig = {
  ...defaultScoring,
  denominatorMaxCarryForwardDays: 70,
  staleAfterDays: 70,
};

export const RARI_PRICE_INSTRUMENTS: PriceableInstrument[] = [
  benchmarkInstrument("GOLD", "TVC", "Gold spot", "USD", "Reserve benchmark"),
  benchmarkInstrument("SPY", "AMEX", "SPDR S&P 500 ETF", "USD", "Broad equities"),
  benchmarkInstrument("DBC", "AMEX", "Invesco DB Commodity Index Tracking Fund", "USD", "Broad commodities"),
  benchmarkInstrument("GDX", "AMEX", "VanEck Gold Miners ETF", "USD", "Gold miners"),
  benchmarkInstrument("XME", "AMEX", "SPDR S&P Metals & Mining ETF", "USD", "Commodity equities"),
  benchmarkInstrument("IWM", "AMEX", "iShares Russell 2000 ETF", "USD", "Equity breadth"),
  benchmarkInstrument("CPIAUCSL", "FRED", "US CPI index", "USD", "Macro inflation"),
];

export const RARI_DEFAULT_DEFINITION: CompositeIndexDefinition = {
  id: RARI_DEFINITION_ID,
  name: "Real Asset Rotation Index",
  description: "Measures whether real assets are outperforming conventional financial assets and whether that leadership is broadening into commodity equities and miners.",
  calculationVersion: RARI_CALCULATION_VERSION,
  missingDataPolicy: {
    mode: "require_all",
    minimumAvailableWeight: 100,
  },
  thresholds: [
    { id: "FINANCIAL_ASSETS_DOMINANT", label: "Financial Assets Dominant", min: 0, max: 25 },
    { id: "FINANCIAL_LEADERSHIP_WEAKENING", label: "Financial Leadership Weakening", min: 25, max: 45 },
    { id: "TRANSITION_MIXED", label: "Transition / Mixed", min: 45, max: 60 },
    { id: "REAL_ASSET_ROTATION_ESTABLISHED", label: "Real Asset Rotation Established", min: 60, max: 75 },
    { id: "STRONG_REAL_ASSET_LEADERSHIP", label: "Strong Real Asset Leadership", min: 75, max: 100 },
  ],
  components: [
    {
      id: "gold-spx",
      name: "Gold / SPX",
      description: "Monetary asset leadership versus equities.",
      numerator: instrument("GOLD", "TVC", "Gold spot", "USD"),
      denominator: instrument("SPY", "AMEX", "S&P 500 proxy", "USD"),
      weight: 30,
      direction: "positive",
      scoringConfig: defaultScoring,
    },
    {
      id: "commodities-spx",
      name: "Commodities / SPX",
      description: "Broad real-asset leadership versus equities.",
      numerator: instrument("DBC", "AMEX", "Broad commodities", "USD"),
      denominator: instrument("SPY", "AMEX", "S&P 500 proxy", "USD"),
      weight: 25,
      direction: "positive",
      scoringConfig: defaultScoring,
    },
    {
      id: "gdx-gold",
      name: "Gold Miners / Gold",
      description: "Miner leverage confirmation.",
      numerator: instrument("GDX", "AMEX", "Gold miners ETF", "USD"),
      denominator: instrument("GOLD", "TVC", "Gold spot", "USD"),
      weight: 15,
      direction: "positive",
      scoringConfig: defaultScoring,
    },
    {
      id: "commodity-equities-commodities",
      name: "Commodity Equities / Commodities",
      description: "Producer-equity leverage confirmation.",
      numerator: instrument("XME", "AMEX", "Metals and mining equities", "USD"),
      denominator: instrument("DBC", "AMEX", "Broad commodities", "USD"),
      weight: 15,
      direction: "positive",
      scoringConfig: defaultScoring,
    },
    {
      id: "equity-breadth-deterioration",
      name: "Equity Breadth Deterioration",
      description: "Small-cap breadth deterioration versus large-cap equities.",
      numerator: instrument("IWM", "AMEX", "Russell 2000 proxy", "USD"),
      denominator: instrument("SPY", "AMEX", "S&P 500 proxy", "USD"),
      weight: 10,
      direction: "inverse",
      scoringConfig: defaultScoring,
    },
    {
      id: "spx-real-return-deterioration",
      name: "SPX Real Return Deterioration",
      description: "Purchasing-power deterioration of the S&P 500 proxy versus CPI.",
      numerator: instrument("SPY", "AMEX", "S&P 500 proxy", "USD"),
      denominator: instrument("CPIAUCSL", "FRED", "US CPI index", "USD"),
      weight: 5,
      direction: "inverse",
      scoringConfig: macroScoring,
    },
  ],
};

export type RariSnapshot = {
  definition: CompositeIndexDefinition;
  current: CompositeIndexResult | null;
  changes: {
    day: number | null;
    week: number | null;
    month: number | null;
  };
  history: CompositeIndexResult[];
};

export function calculateRari(book: Pick<PriceBook, "prices" | "fxRates">, definition: CompositeIndexDefinition = RARI_DEFAULT_DEFINITION) {
  return calculateCompositeIndex(definition, book);
}

export function rariSnapshot(results: CompositeIndexResult[], definition: CompositeIndexDefinition = RARI_DEFAULT_DEFINITION): RariSnapshot {
  const sorted = [...results].sort((left, right) => left.date.localeCompare(right.date));
  const current = [...sorted].reverse().find((point) => point.score != null) ?? sorted.at(-1) ?? null;
  return {
    definition,
    current,
    changes: compositeScoreChanges(sorted, current && current.score != null ? current : undefined),
    history: sorted,
  };
}

export function rariRange(results: CompositeIndexResult[], range: "1Y" | "3Y" | "5Y" | "10Y" | "MAX") {
  return filterCompositeRange([...results].sort((left, right) => left.date.localeCompare(right.date)), range);
}

export function compositeCalculationToStored(calculation: CompositeIndexCalculation): CompositeIndexResult {
  return {
    definitionId: calculation.definitionId,
    date: calculation.date,
    score: calculation.score,
    status: calculation.status,
    regimeId: calculation.regimeId,
    regimeLabel: calculation.regimeLabel,
    calculationVersion: calculation.calculationVersion,
    asOfDate: calculation.asOfDate,
    calculatedAt: calculation.calculatedAt,
    availableWeight: calculation.availableWeight,
    missingWeight: calculation.missingWeight,
    components: calculation.components,
    inputs: {
      name: calculation.name,
      componentCount: calculation.components.length,
      messages: calculation.messages,
    },
  };
}

export function rariBackfillKeys() {
  return RARI_PRICE_INSTRUMENTS.map((instrument) => `${instrument.symbol}:${instrument.exchange}`);
}

function benchmarkInstrument(symbol: string, exchange: string, name: string, currency: string, assetClass: string): PriceableInstrument {
  return { symbol, exchange, name, currency, assetClass, positionCount: 0, quantity: 0, marketValueAud: 0, lastPrice: null, asOfDate: null };
}

function instrument(symbol: string, exchange: string, name: string, currency: string) {
  return { symbol, exchange, name, currency };
}
