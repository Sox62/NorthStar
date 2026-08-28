import type { DashboardHolding, StoredDailyPrice, StoredFxRate } from "@/lib/storage";
import type { Sector } from "@/southernstar/types";
import { RESEARCH_BENCHMARKS, resolveBenchmarkTree, type BenchmarkNode, type BenchmarkTreeInput } from "./benchmark-tree";
import {
  buildInstrumentHistory,
  buildRatioSeries,
  latestRatioTrendState,
  relativeReturnWindows,
  type RatioBasis,
  type RatioMovingAverageConfig,
  type RatioPoint,
  type RatioTrendState,
  type RelativeReturnWindow,
} from "./ratio-engine";

export type RelativeStrengthStackRole = "market" | "sector" | "leader" | "capital";

export type RelativeStrengthBenchmarkProfileConfig = {
  id: string;
  assetClass?: string;
  sector?: Sector;
  marketBenchmarkSymbol?: string;
  sectorBenchmarkSymbol?: string;
  leaderBenchmarkSymbol?: string;
  capitalBenchmarkSymbol?: string;
};

export type RelativeStrengthBenchmarkProfile = {
  id: string;
  assetClass?: string;
  sector: Sector;
  marketBenchmark: BenchmarkNode;
  sectorBenchmark: BenchmarkNode | null;
  leaderBenchmark: BenchmarkNode | null;
  capitalBenchmark: BenchmarkNode;
};

export type RelativeStrengthStackSubject = Pick<DashboardHolding, "id" | "symbol" | "exchange" | "name" | "currency" | "assetClass" | "lastPrice" | "asOfDate" | "source">;

export type RelativeStrengthStackItem = {
  role: RelativeStrengthStackRole;
  label: string;
  numerator: RelativeStrengthStackSubject;
  denominator: BenchmarkNode;
  series: RatioPoint[];
  windows: RelativeReturnWindow[];
  trendState: RatioTrendState;
  etfWarning: string | null;
};

export const RELATIVE_STRENGTH_BENCHMARK_PROFILES: Partial<Record<Sector, RelativeStrengthBenchmarkProfileConfig>> = {
  "Uranium miners": {
    id: "uranium-miners",
    sector: "Uranium miners",
    sectorBenchmarkSymbol: "URA",
    leaderBenchmarkSymbol: "CCJ",
  },
  "Uranium explorers": {
    id: "uranium-explorers",
    sector: "Uranium explorers",
    sectorBenchmarkSymbol: "URA",
    leaderBenchmarkSymbol: "CCJ",
  },
  "Gold miners": {
    id: "gold-miners",
    sector: "Gold miners",
    sectorBenchmarkSymbol: "GDX",
    leaderBenchmarkSymbol: "AEM",
  },
  "Silver miners": {
    id: "silver-miners",
    sector: "Silver miners",
    sectorBenchmarkSymbol: "SLVM",
    leaderBenchmarkSymbol: "PAAS",
  },
  "Copper miners": {
    id: "copper-miners",
    sector: "Copper miners",
    sectorBenchmarkSymbol: "COPX",
    leaderBenchmarkSymbol: "FCX",
  },
  Oil: {
    id: "oil",
    sector: "Oil",
    sectorBenchmarkSymbol: "XLE",
    leaderBenchmarkSymbol: "XOM",
  },
  Technology: {
    id: "technology",
    sector: "Technology",
    sectorBenchmarkSymbol: "QQQ",
  },
  Coal: {
    id: "coal",
    sector: "Coal",
    sectorBenchmarkSymbol: "BTU",
    leaderBenchmarkSymbol: "WHC",
  },
  "Broad equities": {
    id: "broad-equities",
    sector: "Broad equities",
    sectorBenchmarkSymbol: "RSP",
  },
};

const DEFAULT_MARKET_SYMBOL = "SPY";
const DEFAULT_CAPITAL_SYMBOL = "GOLD";
const ETF_HEDGING_WARNING = "Currency-normalised trading prices shown. One or more ETFs may independently hedge underlying currency exposure.";

export function resolveRelativeStrengthBenchmarkProfile(input: BenchmarkTreeInput, extraNodes: BenchmarkNode[] = []): RelativeStrengthBenchmarkProfile {
  const tree = resolveBenchmarkTree(input);
  const config = RELATIVE_STRENGTH_BENCHMARK_PROFILES[tree.sector] ?? { id: fallbackProfileId(tree.sector), sector: tree.sector };
  const candidates = dedupeNodes([...extraNodes, ...tree.path, ...tree.peers, ...RESEARCH_BENCHMARKS]);
  const subjectSymbol = normaliseSymbol(input.symbol);
  const marketBenchmark = preferredNode(candidates, config.marketBenchmarkSymbol ?? DEFAULT_MARKET_SYMBOL, subjectSymbol)
    ?? firstRole(candidates, "sector_etf", subjectSymbol)
    ?? tree.reserve;
  const capitalBenchmark = preferredNode(candidates, config.capitalBenchmarkSymbol ?? DEFAULT_CAPITAL_SYMBOL, subjectSymbol) ?? tree.reserve;
  const sectorBenchmark = preferredNode(candidates, config.sectorBenchmarkSymbol, subjectSymbol)
    ?? firstRole(candidates, "sector_etf", subjectSymbol)
    ?? firstRole(candidates, "commodity", subjectSymbol);
  const leaderBenchmark = preferredNode(candidates, config.leaderBenchmarkSymbol, subjectSymbol)
    ?? firstRole(candidates, "leader", subjectSymbol);

  return {
    id: config.id,
    assetClass: config.assetClass,
    sector: tree.sector,
    marketBenchmark,
    sectorBenchmark,
    leaderBenchmark,
    capitalBenchmark,
  };
}

export function buildRelativeStrengthStack(input: {
  subject: RelativeStrengthStackSubject;
  subjectNode?: BenchmarkNode | null;
  prices: StoredDailyPrice[];
  fxRates: StoredFxRate[];
  benchmarkNodes?: BenchmarkNode[];
  basis?: RatioBasis;
  movingAverage?: RatioMovingAverageConfig;
}): RelativeStrengthStackItem[] {
  const basis = input.basis ?? "fx_normalised";
  const movingAverage = input.movingAverage ?? { type: "sma", period: 36 };
  const profile = resolveRelativeStrengthBenchmarkProfile(
    {
      symbol: input.subject.symbol,
      name: [input.subject.name, input.subject.assetClass].filter(Boolean).join(" "),
      sector: undefined,
      exchange: input.subject.exchange,
      currency: input.subject.currency,
    },
    input.benchmarkNodes,
  );
  const numeratorHistory = buildInstrumentHistory(input.prices, input.fxRates, {
    id: input.subject.id,
    symbol: input.subject.symbol,
    exchange: input.subject.exchange,
    name: input.subject.name,
    currency: input.subject.currency,
    currentClose: input.subject.lastPrice,
    currentDate: input.subject.asOfDate,
    currentSource: input.subject.source || "Current position",
  });
  const benchmarks = [
    { role: "market" as const, label: "Market", node: profile.marketBenchmark },
    profile.sectorBenchmark ? { role: "sector" as const, label: "Sector", node: profile.sectorBenchmark } : null,
    profile.leaderBenchmark ? { role: "leader" as const, label: "Sector Leader", node: profile.leaderBenchmark } : null,
    { role: "capital" as const, label: "Capital Benchmark", node: profile.capitalBenchmark },
  ].filter((item): item is { role: RelativeStrengthStackRole; label: string; node: BenchmarkNode } => Boolean(item));
  const subjectNode = input.subjectNode ?? RESEARCH_BENCHMARKS.find((node) => node.symbol && normaliseSymbol(node.symbol) === normaliseSymbol(input.subject.symbol)) ?? null;

  return benchmarks
    .filter((item) => item.node.symbol && normaliseSymbol(item.node.symbol) !== normaliseSymbol(input.subject.symbol))
    .map((item) => {
      const denominatorHistory = historyForBenchmark(input.prices, input.fxRates, item.node);
      const series = buildRatioSeries(numeratorHistory, denominatorHistory);
      return {
        role: item.role,
        label: item.label,
        numerator: input.subject,
        denominator: item.node,
        series,
        windows: relativeReturnWindows(series),
        trendState: latestRatioTrendState(series, movingAverage, basis),
        etfWarning: etfHedgingWarning(subjectNode, item.node),
      };
    });
}

export function relativeStrengthStackBackfillKeys(subject: RelativeStrengthStackSubject, items: RelativeStrengthStackItem[]) {
  return unique([instrumentBackfillKey(subject.symbol, subject.exchange), ...items.map((item) => benchmarkBackfillKey(item.denominator))]);
}

export function benchmarkBackfillKey(node: BenchmarkNode) {
  const symbol = node.symbol ?? node.label;
  const exchange = node.tradingViewSymbol?.split(":")[0] ?? "";
  return instrumentBackfillKey(symbol, exchange);
}

function historyForBenchmark(prices: StoredDailyPrice[], fxRates: StoredFxRate[], node: BenchmarkNode) {
  const symbol = node.symbol ?? node.label;
  const exchange = node.tradingViewSymbol?.split(":")[0] ?? "";
  const direct = buildInstrumentHistory(prices, fxRates, {
    id: node.id,
    symbol,
    exchange,
    name: node.label,
    currency: node.basisCurrency,
  });
  if (direct.length || !node.tradingViewSymbol?.includes(":")) return direct;
  return buildInstrumentHistory(prices, fxRates, {
    id: node.id,
    symbol,
    name: node.label,
    currency: node.basisCurrency,
  });
}

function etfHedgingWarning(left: BenchmarkNode | null | undefined, right: BenchmarkNode) {
  const nodes = [left, right].filter((node): node is BenchmarkNode => Boolean(node));
  return nodes.some((node) => node.instrumentType === "etf" && node.currencyHedging !== "unhedged")
    ? ETF_HEDGING_WARNING
    : null;
}

function preferredNode(nodes: BenchmarkNode[], symbol: string | undefined, subjectSymbol: string) {
  if (!symbol) return null;
  return nodes.find((node) => node.symbol && normaliseSymbol(node.symbol) === normaliseSymbol(symbol) && normaliseSymbol(node.symbol) !== subjectSymbol) ?? null;
}

function firstRole(nodes: BenchmarkNode[], role: BenchmarkNode["role"], subjectSymbol: string) {
  return nodes.find((node) => node.role === role && node.symbol && normaliseSymbol(node.symbol) !== subjectSymbol) ?? null;
}

function dedupeNodes(nodes: BenchmarkNode[]) {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    const key = node.symbol ? normaliseSymbol(node.symbol) : node.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function instrumentBackfillKey(symbol: string, exchange: string | null | undefined) {
  const cleanSymbol = normaliseSymbol(symbol);
  const cleanExchange = exchange?.trim().toUpperCase();
  return cleanExchange ? cleanSymbol + ":" + cleanExchange : cleanSymbol;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normaliseSymbol(value: string) {
  return value.trim().toUpperCase();
}

function fallbackProfileId(sector: Sector) {
  return sector.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
