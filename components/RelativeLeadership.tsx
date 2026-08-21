"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import TradingViewWidget from "@/components/TradingViewWidget";
import type { DashboardData, DashboardHolding, MinerFundamentals, OwnerType, Scope, StoredDailyPrice, StoredFxRate, StructuralLevel } from "@/lib/storage";
import { Card, Notice, SummaryGrid } from "@/northstar/components";
import { RESEARCH_BENCHMARKS, resolveBenchmarkTree, type BenchmarkNode } from "@/northstar/lib/benchmark-tree";
import { applyRatioRange, buildInstrumentHistory, buildRatioSeries, relativeReturnWindows, scoreRatioTrend, scoreRatioTrendVelocity, RATIO_RANGES, type RatioPoint, type RatioRangeKey, type RelativeReturnWindow, type RelativeScoreCheck, type RelativeScoreComponent } from "@/northstar/lib/ratio-engine";
import { sectorForInstrument } from "@/northstar/lib/sector-map";
import { customBenchmarkNode, parseSelectionValue, selectionValue } from "@/northstar/lib/selection";
import { tradingViewChartUrl, tradingViewRatioChartUrl, tradingViewRatioExpression, tradingViewSymbolForInstrument } from "@/northstar/lib/tradingview";

type DashboardMap = Partial<Record<Scope, DashboardData>>;
type PriceBookResponse = {
  prices?: StoredDailyPrice[];
  fxRates?: StoredFxRate[];
  error?: string;
};
type StructuralLevelsResponse = { levels?: StructuralLevel[]; error?: string };
type FundamentalsResponse = { fundamentals?: MinerFundamentals[]; error?: string };
type IdeaGroup = { label: string; nodes: BenchmarkNode[] };
type RelativeLayer = { label: string; target: string; score: number; max: number; component: RelativeScoreComponent; velocity: number | null };
type RelativeEngineScore = { score: number; velocity: number | null; reserve: RelativeLayer; sector: RelativeLayer | null; peers: RelativeLayer; peerCount: number; peerWins: number; sentence: string };
type StructuralLevelForm = {
  id: string;
  symbol: string;
  comparisonSymbol: string;
  label: string;
  timeframe: StructuralLevel["timeframe"];
  direction: StructuralLevel["direction"];
  level: string;
  status: StructuralLevel["status"];
  source: string;
  notes: string;
  asOfDate: string;
};
type RatioMode = "ratio" | "indexed";
type RangeKey = Extract<RatioRangeKey, "all" | "5y" | "3y" | "12m" | "6m" | "3m" | "1m">;

const scopes: Array<{ key: Scope; label: string }> = [
  { key: "overall", label: "Overall" },
  { key: "personal", label: "Personal" },
  { key: "smsf", label: "SMSF" },
];

const ranges: Array<{ key: RangeKey; label: string; days: number | null }> = RATIO_RANGES.filter((item) => ["all", "5y", "3y", "12m", "6m", "3m", "1m"].includes(item.key)) as Array<{ key: RangeKey; label: string; days: number | null }>;
const evidenceRanges = RATIO_RANGES.filter((item) => ["1m", "3m", "6m", "12m", "3y", "5y"].includes(item.key));

const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

const BENCHMARK_OWNER: OwnerType = "PERSONAL";
const structuralBlank: StructuralLevelForm = {
  id: "",
  symbol: "",
  comparisonSymbol: "GOLD",
  label: "Major structural level",
  timeframe: "monthly",
  direction: "resistance",
  level: "",
  status: "watching",
  source: "",
  notes: "",
  asOfDate: "",
};

const localPrice = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString("en-AU", {
    minimumFractionDigits: value >= 100 ? 2 : 3,
    maximumFractionDigits: value >= 100 ? 2 : 4,
  })}`;

const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;

const periodPercent = (value: number | null) => value == null ? "n/a" : percent(value);
const periodTone = (value: number | null) => value == null ? "isMuted" : value >= 0 ? "isPositive" : "isNegative";

const dateLabel = (value: string) => {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

async function loadDashboard(scope: Scope): Promise<DashboardData> {
  const response = await fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load dashboard");
  return payload as DashboardData;
}

async function loadStoredPrices(): Promise<{ prices: StoredDailyPrice[]; fxRates: StoredFxRate[] }> {
  const response = await fetch("/api/prices/daily?limit=12000", { cache: "no-store" });
  const payload = await response.json() as PriceBookResponse;
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load stored prices");
  return { prices: payload.prices ?? [], fxRates: payload.fxRates ?? [] };
}

async function loadFundamentals(): Promise<MinerFundamentals[]> {
  const response = await fetch("/api/fundamentals", { cache: "no-store" });
  const payload = await response.json() as FundamentalsResponse;
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load saved fundamentals");
  return payload.fundamentals ?? [];
}

async function loadStructuralLevels(symbols: string[]): Promise<StructuralLevel[]> {
  const query = symbols.filter(Boolean).map((symbol) => symbol.toUpperCase()).join(",");
  const response = await fetch("/api/structural-levels" + (query ? "?symbols=" + encodeURIComponent(query) : ""), { cache: "no-store" });
  const payload = await response.json() as StructuralLevelsResponse;
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load structural levels");
  return payload.levels ?? [];
}

function historyForHolding(prices: StoredDailyPrice[], fxRates: StoredFxRate[], holding: DashboardHolding) {
  return buildInstrumentHistory(prices, fxRates, {
    id: holding.id,
    symbol: holding.symbol,
    exchange: holding.exchange,
    name: holding.name,
    currency: holding.currency,
    currentClose: holding.lastPrice,
    currentDate: holding.asOfDate,
    currentSource: holding.source || "Current position",
  });
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

function historyForComparison(prices: StoredDailyPrice[], fxRates: StoredFxRate[], holding: DashboardHolding | null, node: BenchmarkNode | null) {
  if (holding) return historyForHolding(prices, fxRates, holding);
  if (node) return historyForBenchmark(prices, fxRates, node);
  return [];
}
function backfillKeyForHolding(holding: DashboardHolding) {
  return holding.exchange ? holding.symbol + ":" + holding.exchange : holding.symbol;
}

function backfillKeyForBenchmark(node: BenchmarkNode) {
  const symbol = node.symbol ?? node.label;
  const exchange = node.tradingViewSymbol?.split(":")[0] ?? "";
  return exchange ? symbol + ":" + exchange : symbol;
}

function isChartable(holding: DashboardHolding) {
  return holding.symbol !== "CASH" && holding.exchange !== "CASH" && holding.lastPrice != null && holding.lastPrice > 0;
}

function defaultSymbol(rows: DashboardHolding[], fallbackIndex: number) {
  return rows[fallbackIndex]?.id ?? rows[0]?.id ?? "";
}

function benchmarkInstrument(node: BenchmarkNode): DashboardHolding {
  return {
    id: node.id,
    ownerType: BENCHMARK_OWNER,
    broker: "Benchmark",
    accountKey: "benchmark",
    instrumentKey: node.id,
    symbol: node.symbol ?? node.label,
    name: node.label,
    exchange: node.tradingViewSymbol?.split(":")[0] ?? "",
    currency: node.basisCurrency,
    assetClass: node.role,
    quantity: 0,
    lastPrice: null,
    averageCostAud: 0,
    costAud: 0,
    marketValueAud: 0,
    dayGainAud: 0,
    pnlAud: 0,
    pnlPercent: 0,
    valuationBasis: "market",
    asOfDate: "",
    source: "Benchmark tree",
    weight: 0,
  };
}

function nodeIsChartable(node: BenchmarkNode) {
  return Boolean(node.symbol && node.tradingViewSymbol && node.role !== "peer_group");
}

function mergeBenchmarkNodes(nodes: BenchmarkNode[]) {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    const key = node.symbol ? node.symbol.toUpperCase() : node.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function benchmarkOptionLabel(node: BenchmarkNode) {
  const symbol = node.symbol ?? node.label;
  return `${symbol} · ${node.label}`;
}

function savedIdeaNode(item: MinerFundamentals): BenchmarkNode {
  const symbol = item.symbol.trim().toUpperCase();
  const category = savedIdeaCategory(item);
  return {
    id: `saved_idea:${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${symbol}`,
    label: item.name?.trim() || symbol,
    role: "candidate",
    symbol,
    tradingViewSymbol: symbol,
    basisCurrency: "USD",
    note: [category, item.projectStage, item.jurisdiction].filter(Boolean).join(" · ") || "Saved fundamentals idea",
  };
}

function savedIdeaCategory(item: MinerFundamentals) {
  const metal = (item.primaryMetal ?? "").toLowerCase();
  const stage = (item.projectStage ?? "").toLowerCase();
  if (/developer|development|explorer|exploration|pre[- ]?production|permitting|study|feasibility/.test(stage)) return "Developers";
  if (metal.includes("gold")) return "Gold Producers";
  if (metal.includes("silver")) return "Silver";
  if (metal.includes("uranium")) return "Uranium";
  if (metal.includes("copper")) return "Copper";
  return "Other Saved Ideas";
}

function groupSavedIdeaNodes(nodes: BenchmarkNode[]): IdeaGroup[] {
  const order = ["Gold Producers", "Silver", "Uranium", "Copper", "Developers", "Other Saved Ideas"];
  const groups = new Map(order.map((label) => [label, [] as BenchmarkNode[]]));
  for (const node of nodes) {
    const label = node.note?.split(" · ")[0] || "Other Saved Ideas";
    const group = groups.get(label) ?? groups.get("Other Saved Ideas")!;
    group.push(node);
  }
  return order
    .map((label) => ({ label, nodes: (groups.get(label) ?? []).sort((a, b) => (a.symbol ?? a.label).localeCompare(b.symbol ?? b.label)) }))
    .filter((group) => group.nodes.length);
}

function strengthLabel(score: number | null) {
  if (score == null) return "n/a";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Leading";
  if (score > 45) return "Neutral";
  if (score > 30) return "Lagging";
  return "Weak";
}

function strengthTone(score: number | null) {
  if (score == null) return undefined;
  if (score >= 55) return "positive";
  if (score <= 45) return "negative";
  return undefined;
}

function scoreBadge(score: number | null) {
  if (score == null) return "n/a";
  if (score >= 75) return "Strong";
  if (score >= 60) return "Leading";
  if (score >= 45) return "Neutral";
  if (score >= 30) return "Lagging";
  return "Weak";
}

function velocityLabel(value: number | null) {
  if (value == null) return "n/a";
  const rounded = Math.round(value);
  if (rounded === 0) return "0 over 30d";
  return rounded > 0 ? "up +" + rounded + " over 30d" : "down " + rounded + " over 30d";
}

function componentWins(component: RelativeScoreComponent) {
  return component.score >= component.max * 0.55;
}

function layerScore(label: string, target: DashboardHolding, max: number, series: RatioPoint[]): RelativeLayer {
  const component = scoreRatioTrend(series, max);
  return {
    label,
    target: target.symbol,
    score: component.score,
    max,
    component,
    velocity: scoreRatioTrendVelocity(series, max),
  };
}

function categoryForAsset(asset: DashboardHolding) {
  const sector = sectorForInstrument(asset);
  if (sector === "Gold miners") return "Gold Producers";
  if (sector === "Silver miners" || sector === "Silver bullion") return "Silver";
  if (sector === "Uranium miners" || sector === "Uranium explorers") return "Uranium";
  if (sector === "Copper miners") return "Copper";
  return sector;
}

function sectorBenchmarkFor(asset: DashboardHolding, benchmarkNodes: BenchmarkNode[]) {
  const tree = resolveBenchmarkTree({ symbol: asset.symbol, name: asset.name, sector: sectorForInstrument(asset), exchange: asset.exchange, currency: asset.currency });
  const node = tree.path.find((item) => item.role === "sector_etf" && item.symbol !== asset.symbol)
    ?? tree.path.find((item) => item.role === "commodity" && item.symbol !== asset.symbol)
    ?? null;
  if (!node) return null;
  return benchmarkNodes.find((item) => item.id === node.id) ?? node;
}

function peerNodesFor(asset: DashboardHolding, holdings: DashboardHolding[], savedIdeaNodes: BenchmarkNode[], benchmarkNodes: BenchmarkNode[]) {
  const sector = sectorForInstrument(asset);
  const category = categoryForAsset(asset);
  const tree = resolveBenchmarkTree({ symbol: asset.symbol, name: asset.name, sector, exchange: asset.exchange, currency: asset.currency });
  const heldPeers = holdings
    .filter((holding) => holding.symbol !== asset.symbol && sectorForInstrument(holding) === sector)
    .map((holding): BenchmarkNode => ({
      id: "peer_holding:" + holding.id,
      label: holding.name,
      role: "candidate",
      symbol: holding.symbol,
      tradingViewSymbol: tradingViewSymbolForInstrument(holding),
      basisCurrency: holding.currency === "USD" || holding.currency === "CAD" || holding.currency === "GBP" ? holding.currency : "AUD",
    }));
  const savedPeers = savedIdeaNodes.filter((node) => node.symbol !== asset.symbol && (node.note?.split(" · ")[0] ?? "") === category);
  const templatePeers = tree.peers.filter((node) => node.symbol && node.symbol !== asset.symbol && node.tradingViewSymbol);
  return mergeBenchmarkNodes([...heldPeers, ...savedPeers, ...templatePeers])
    .map((node) => benchmarkNodes.find((item) => item.id === node.id) ?? node)
    .filter(nodeIsChartable)
    .slice(0, 12);
}

function buildRelativeEngineScore(input: {
  asset: DashboardHolding;
  prices: StoredDailyPrice[];
  fxRates: StoredFxRate[];
  holdings: DashboardHolding[];
  savedIdeaNodes: BenchmarkNode[];
  benchmarkNodes: BenchmarkNode[];
}): RelativeEngineScore {
  const assetHistory = historyForHolding(input.prices, input.fxRates, input.asset);
  const reserveNode = input.benchmarkNodes.find((node) => node.id === "reserve:gold") ?? RESEARCH_BENCHMARKS.find((node) => node.id === "reserve:gold")!;
  const reserveInstrument = benchmarkInstrument(reserveNode);
  const reserveSeries = buildRatioSeries(assetHistory, historyForBenchmark(input.prices, input.fxRates, reserveNode));
  const reserve = layerScore("Reserve", reserveInstrument, 50, reserveSeries);

  const sectorNode = sectorBenchmarkFor(input.asset, input.benchmarkNodes);
  const sectorInstrument = sectorNode ? benchmarkInstrument(sectorNode) : null;
  const sectorSeries = sectorNode ? buildRatioSeries(assetHistory, historyForBenchmark(input.prices, input.fxRates, sectorNode)) : [];
  const sector = sectorInstrument ? layerScore("Sector", sectorInstrument, 30, sectorSeries) : null;

  const peerNodes = peerNodesFor(input.asset, input.holdings, input.savedIdeaNodes, input.benchmarkNodes);
  const peerLayers = peerNodes.map((node) => {
    const peerInstrument = benchmarkInstrument(node);
    const peerSeries = buildRatioSeries(assetHistory, historyForBenchmark(input.prices, input.fxRates, node));
    return layerScore("Peer", peerInstrument, 20, peerSeries);
  });
  const peerScore = peerLayers.length ? peerLayers.reduce((sum, layer) => sum + layer.score, 0) / peerLayers.length : 0;
  const peerVelocityValues = peerLayers.map((layer) => layer.velocity).filter((value): value is number => value != null);
  const peerVelocity = peerVelocityValues.length ? peerVelocityValues.reduce((sum, value) => sum + value, 0) / peerVelocityValues.length : null;
  const peerWins = peerLayers.filter((layer) => componentWins(layer.component)).length;
  const peers: RelativeLayer = {
    label: "Peers",
    target: peerLayers.length ? String(peerLayers.length) + " peers" : "No peers",
    score: peerScore,
    max: 20,
    component: { score: peerScore, max: 20, checks: peerLayers.flatMap((layer) => layer.component.checks), availableChecks: peerLayers.reduce((sum, layer) => sum + layer.component.availableChecks, 0) },
    velocity: peerVelocity,
  };

  const velocityParts = [reserve.velocity, sector?.velocity ?? null, peers.velocity].filter((value): value is number => value != null);
  const score = reserve.score + (sector?.score ?? 0) + peers.score;
  const velocity = velocityParts.length ? velocityParts.reduce((sum, value) => sum + value, 0) : null;
  const sectorText = sector ? sector.target : "sector benchmark";
  const peerText = peerLayers.length ? String(Math.round(peerWins / peerLayers.length * 100)) + "% of peers" : "no comparable peers yet";
  const reserveText = componentWins(reserve.component) ? "beating " + reserve.target : "not yet beating " + reserve.target;
  const sectorOutcome = sector && componentWins(sector.component) ? "beating " + sectorText : "not yet beating " + sectorText;
  const sentence = "Reserve: " + reserveText + " · Sector: " + sectorOutcome + " · Peers: " + peerText;
  return { score, velocity, reserve, sector, peers, peerCount: peerLayers.length, peerWins, sentence };
}

function checkMark(check: RelativeScoreCheck) {
  if (!check.available) return "-";
  return check.passed ? "yes" : "no";
}

function formatAxisTick(value: number, mode: RatioMode) {
  if (mode !== "ratio") return value.toFixed(1);
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function RatioChart({ series, mode, left, right }: { series: RatioPoint[]; mode: RatioMode; left: DashboardHolding; right: DashboardHolding }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement | null>(null);
  const width = 920;
  const height = 360;
  const padX = 40;
  const padTop = 28;
  const padBottom = 42;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padTop - padBottom;
  const values = mode === "ratio"
    ? series.map((point) => point.ratio)
    : series.flatMap((point) => [point.leftIndexed, point.rightIndexed]);
  const rawMax = values.length ? Math.max(...values) : 1;
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawRange = Math.max(0.000001, rawMax - rawMin);
  const padding = mode === "ratio" ? Math.max(rawRange * 0.08, Math.abs(rawMax) * 0.02, 0.01) : 0;
  const max = mode === "ratio" ? rawMax + padding : Math.max(rawMax, 100);
  const min = mode === "ratio" ? Math.max(0, rawMin - padding) : Math.min(rawMin, 100);
  const range = Math.max(0.000001, max - min);
  const xy = (point: RatioPoint, index: number, key: "ratio" | "leftIndexed" | "rightIndexed") => ({
    x: padX + (series.length === 1 ? chartWidth : index / Math.max(1, series.length - 1) * chartWidth),
    y: padTop + (max - point[key]) / range * chartHeight,
  });
  const pathFor = (key: "ratio" | "leftIndexed" | "rightIndexed") =>
    series.map((point, index) => {
      const pointXY = xy(point, index, key);
      return `${index === 0 ? "M" : "L"} ${pointXY.x.toFixed(2)} ${pointXY.y.toFixed(2)}`;
    }).join(" ");
  const active = hoverIndex == null ? null : series[hoverIndex];
  const activeXY = active ? xy(active, hoverIndex!, mode === "ratio" ? "ratio" : "leftIndexed") : null;
  const ticks = [max, min + range / 2, min];
  const labels = series.filter((_, index) => {
    if (series.length <= 6) return true;
    return index % Math.max(1, Math.floor(series.length / 5)) === 0 || index === series.length - 1;
  }).slice(-6);
  const onPointerMove = (event: React.PointerEvent<SVGElement>) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(ratio * Math.max(0, series.length - 1)));
  };

  return (
    <div className="relativeChartWrap">
      <svg ref={chartRef} className="relativeChart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${left.symbol} versus ${right.symbol}`}>
        {ticks.map((tick) => {
          const y = padTop + (max - tick) / range * chartHeight;
          return (
            <g key={tick.toFixed(4)}>
              <line className="relativeChartGrid" x1={padX} x2={padX + chartWidth} y1={y} y2={y} />
              <text className="relativeChartAxis" x={padX + chartWidth - 5} y={Math.max(12, y - 6)} textAnchor="end">{formatAxisTick(tick, mode)}</text>
            </g>
          );
        })}
        {mode === "ratio" ? (
          <path className="relativeChartLine isRatio" d={pathFor("ratio")} />
        ) : (
          <>
            <path className="relativeChartLine isLeft" d={pathFor("leftIndexed")} />
            <path className="relativeChartLine isRight" d={pathFor("rightIndexed")} />
          </>
        )}
        {active && activeXY ? (
          <>
            <line className="relativeChartCrosshair" x1={activeXY.x} x2={activeXY.x} y1={padTop} y2={height - padBottom} />
            <circle className="relativeChartDot" cx={activeXY.x} cy={activeXY.y} r="5" />
          </>
        ) : null}
        <rect x="0" y="0" width={width} height={height} fill="transparent" onPointerMove={onPointerMove} onPointerLeave={() => setHoverIndex(null)} />
        {labels.map((point) => {
          const index = series.indexOf(point);
          const x = padX + (series.length === 1 ? chartWidth : index / Math.max(1, series.length - 1) * chartWidth);
          return <text key={point.date} className="relativeChartDate" x={x} y={height - 11} textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"}>{dateLabel(point.date).replace(" 202", " 2")}</text>;
        })}
      </svg>
      {active && activeXY ? (
        <div className={`relativeTooltip ${activeXY.x > width * 0.66 ? "isLeft" : ""}`} style={{ left: `${activeXY.x / width * 100}%`, top: `${Math.max(10, Math.min(74, activeXY.y / height * 100))}%` }}>
          <span>{dateLabel(active.date)}</span>
          {mode === "ratio" ? <strong>{active.ratio.toFixed(2)} ratio</strong> : <strong>{left.symbol} {active.leftIndexed.toFixed(1)} · {right.symbol} {active.rightIndexed.toFixed(1)}</strong>}
          <em>{localPrice(active.left, left.currency)} / {localPrice(active.right, right.currency)}</em>
        </div>
      ) : null}
    </div>
  );
}

function RelativePeriodCell({ window, left, right }: { window: RelativeReturnWindow; left: string; right: string }) {
  const enoughData = window.points >= 2 && window.ratioReturnPercent != null;
  const detail = enoughData
    ? window.points + " closes · " + left + " " + periodPercent(window.leftReturnPercent) + " / " + right + " " + periodPercent(window.rightReturnPercent)
    : "Not enough overlap";
  return (
    <div className="relativePeriodCell">
      <span>{window.label}</span>
      <strong className={periodTone(window.ratioReturnPercent)}>{periodPercent(window.ratioReturnPercent)}</strong>
      <em>{detail}</em>
    </div>
  );
}
function ComparisonOptionGroups({ permanent, custom, savedGroups, side }: { permanent: BenchmarkNode[]; custom: BenchmarkNode[]; savedGroups: IdeaGroup[]; side: "left" | "right" }) {
  return (
    <>
      <optgroup label="Permanent benchmarks">
        {permanent.map((node) => (
          <option key={node.id + ":" + side} value={selectionValue("benchmark", node.id)}>{benchmarkOptionLabel(node)}</option>
        ))}
      </optgroup>
      {custom.length ? (
        <optgroup label="Typed tickers">
          {custom.map((node) => (
            <option key={node.id + ":" + side} value={selectionValue("benchmark", node.id)}>{benchmarkOptionLabel(node)}</option>
          ))}
        </optgroup>
      ) : null}
      {savedGroups.map((group) => (
        <optgroup key={group.label + ":" + side} label={"Saved ideas — " + group.label}>
          {group.nodes.map((node) => (
            <option key={node.id + ":" + side} value={selectionValue("benchmark", node.id)}>{benchmarkOptionLabel(node)}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
function RelativeScorePanel({ score }: { score: RelativeEngineScore }) {
  const layers = [score.reserve, score.sector, score.peers].filter((layer): layer is RelativeLayer => Boolean(layer));
  return (
    <div className="relativeScorePanel">
      <div className="relativeScoreHero">
        <div>
          <p className="eyebrow">Relative ranking engine</p>
          <h3>Relative Score {Math.round(score.score)} <span>{scoreBadge(score.score)}</span></h3>
          <p>{score.sentence}</p>
        </div>
        <div>
          <strong>{velocityLabel(score.velocity)}</strong>
          <span>Score velocity</span>
        </div>
      </div>
      <div className="relativeScoreLayers">
        {layers.map((layer) => (
          <div className="relativeScoreLayer" key={layer.label}>
            <div className="relativeScoreLayerHead">
              <span>{layer.label} vs {layer.target}</span>
              <strong>{Math.round(layer.score)}/{layer.max}</strong>
            </div>
            {layer.label === "Peers" ? (
              <p>{score.peerCount ? "Outperforming " + score.peerWins + " of " + score.peerCount + " comparable peers." : "No comparable peer history yet."}</p>
            ) : (
              <ul>
                {layer.component.checks.map((check) => (
                  <li key={layer.label + check.key}>
                    <span>{checkMark(check)}</span>
                    <div><strong>{check.label}</strong><em>{check.detail}</em></div>
                    <b>{Math.round(check.points)}/{Math.round(check.max)}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="relativeScoreNote">Relative Score identifies what is earning capital. Entry Score is deliberately separate and not inferred here.</p>
    </div>
  );
}
export default function RelativeLeadership() {
  const [dashboards, setDashboards] = useState<DashboardMap>({});
  const [prices, setPrices] = useState<StoredDailyPrice[]>([]);
  const [fundamentals, setFundamentals] = useState<MinerFundamentals[]>([]);
  const [fxRates, setFxRates] = useState<StoredFxRate[]>([]);
  const [scope, setScope] = useState<Scope>("overall");
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [leftBenchmarkId, setLeftBenchmarkId] = useState("");
  const [rightBenchmarkId, setRightBenchmarkId] = useState("");
  const [mode, setMode] = useState<RatioMode>("ratio");
  const [range, setRange] = useState<RangeKey>("all");
  const [loading, setLoading] = useState(true);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [customNodes, setCustomNodes] = useState<BenchmarkNode[]>([]);
  const [customLeftInput, setCustomLeftInput] = useState("");
  const [customRightInput, setCustomRightInput] = useState("");
  const [customError, setCustomError] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const [copiedRatio, setCopiedRatio] = useState(false);
  const [structuralLevels, setStructuralLevels] = useState<StructuralLevel[]>([]);
  const [structuralForm, setStructuralForm] = useState<StructuralLevelForm>(structuralBlank);
  const [structuralBusy, setStructuralBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [overall, personal, smsf, storedPrices, savedFundamentals] = await Promise.all([
          loadDashboard("overall"),
          loadDashboard("personal"),
          loadDashboard("smsf"),
          loadStoredPrices(),
          loadFundamentals(),
        ]);
        if (!cancelled) {
          setDashboards({ overall, personal, smsf });
          setPrices(storedPrices.prices);
          setFxRates(storedPrices.fxRates);
          setFundamentals(savedFundamentals);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load relative chart");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const holdings = useMemo(() => {
    return (dashboards[scope]?.holdings ?? [])
      .filter(isChartable)
      .sort((left, right) => right.marketValueAud - left.marketValueAud);
  }, [dashboards, scope]);

  useEffect(() => {
    if (!holdings.length) return;
    if (!leftBenchmarkId && !holdings.some((holding) => holding.id === leftId)) setLeftId(defaultSymbol(holdings, 0));
    if (!rightBenchmarkId && !holdings.some((holding) => holding.id === rightId)) setRightId(defaultSymbol(holdings, 1));
  }, [holdings, leftId, rightId, leftBenchmarkId, rightBenchmarkId]);

  const heldSymbols = useMemo(() => new Set(holdings.map((holding) => holding.symbol.toUpperCase())), [holdings]);
  const savedIdeaNodes = useMemo(() => {
    return fundamentals
      .filter((item) => item.symbol && !heldSymbols.has(item.symbol.toUpperCase()))
      .map(savedIdeaNode)
      .filter(nodeIsChartable);
  }, [fundamentals, heldSymbols]);
  const savedIdeaGroups = useMemo(() => groupSavedIdeaNodes(savedIdeaNodes), [savedIdeaNodes]);
  const benchmarkNodes = useMemo(() => {
    const holdingBenchmarks = holdings.flatMap((holding) => {
      const tree = resolveBenchmarkTree({ symbol: holding.symbol, name: holding.name, sector: sectorForInstrument(holding), exchange: holding.exchange, currency: holding.currency });
      return tree ? [...tree.path, ...tree.peers] : [];
    });
    return mergeBenchmarkNodes([...customNodes, ...savedIdeaNodes, ...holdingBenchmarks, ...RESEARCH_BENCHMARKS]).filter(nodeIsChartable);
  }, [customNodes, holdings, savedIdeaNodes]);
  const customNodeIds = useMemo(() => new Set(customNodes.map((node) => node.id)), [customNodes]);
  const savedIdeaNodeIds = useMemo(() => new Set(savedIdeaNodes.map((node) => node.id)), [savedIdeaNodes]);
  const permanentBenchmarkNodes = useMemo(() => benchmarkNodes.filter((node) => !customNodeIds.has(node.id) && !savedIdeaNodeIds.has(node.id)), [benchmarkNodes, customNodeIds, savedIdeaNodeIds]);
  const leftHolding = holdings.find((holding) => holding.id === leftId) ?? null;
  const rightHolding = holdings.find((holding) => holding.id === rightId) ?? null;
  const selectedLeftBenchmark = benchmarkNodes.find((node) => node.id === leftBenchmarkId) ?? null;
  const selectedBenchmark = benchmarkNodes.find((node) => node.id === rightBenchmarkId) ?? null;
  const left = selectedLeftBenchmark ? benchmarkInstrument(selectedLeftBenchmark) : leftHolding ?? holdings[0];
  const right = selectedBenchmark ? benchmarkInstrument(selectedBenchmark) : rightHolding ?? holdings[1] ?? holdings[0];
  const leftHistory = historyForComparison(prices, fxRates, selectedLeftBenchmark ? null : left, selectedLeftBenchmark);
  const rightHistory = historyForComparison(prices, fxRates, selectedBenchmark ? null : right, selectedBenchmark);
  const fullSeries = left && right ? buildRatioSeries(leftHistory, rightHistory) : [];
  const series = applyRatioRange(fullSeries, range);
  const evidenceWindows = useMemo(() => relativeReturnWindows(fullSeries, evidenceRanges), [fullSeries]);
  const pairThreeMonth = evidenceWindows.find((item) => item.key === "3m")?.ratioReturnPercent ?? null;
  const relativeEngine = useMemo(() => left ? buildRelativeEngineScore({ asset: left, prices, fxRates, holdings, savedIdeaNodes, benchmarkNodes }) : null, [left, prices, fxRates, holdings, savedIdeaNodes, benchmarkNodes]);
  const first = series[0];
  const last = series.at(-1);
  const ratioChange = first && last ? last.ratio / first.ratio * 100 - 100 : 0;
  const leftChange = first && last ? last.leftIndexed - 100 : 0;
  const rightChange = first && last ? last.rightIndexed - 100 : 0;
  const leftTvSymbol = left ? tradingViewSymbolForInstrument(left) : "";
  const rightTvSymbol = selectedBenchmark?.tradingViewSymbol ?? (right ? tradingViewSymbolForInstrument(right) : "");
  const leftTv = leftTvSymbol ? tradingViewChartUrl(leftTvSymbol) : "";
  const rightTv = rightTvSymbol ? tradingViewChartUrl(rightTvSymbol) : "";
  const ratioTvExpression = leftTvSymbol && rightTvSymbol ? tradingViewRatioExpression(leftTvSymbol, rightTvSymbol) : "";
  const ratioTv = ratioTvExpression ? tradingViewRatioChartUrl(leftTvSymbol, rightTvSymbol) : "";
  const currentPairSymbols = [left?.symbol, right?.symbol].filter(Boolean) as string[];
  const pairStructuralLevels = structuralLevels.filter((level) => currentPairSymbols.includes(level.symbol) || currentPairSymbols.includes(level.comparisonSymbol));
  const relativeScoreValue = relativeEngine?.score ?? null;
  const strengthToneValue = strengthTone(relativeScoreValue);
  const strengthEntry: [string, ReactNode] | [string, ReactNode, "positive" | "negative"] = strengthToneValue
    ? ["Relative Score", relativeScoreValue == null ? "n/a" : Math.round(relativeScoreValue), strengthToneValue]
    : ["Relative Score", relativeScoreValue == null ? "n/a" : Math.round(relativeScoreValue)];
  const velocityEntry: [string, ReactNode] = ["Velocity", relativeEngine ? velocityLabel(relativeEngine.velocity) : "n/a"];

  useEffect(() => {
    let cancelled = false;
    async function loadLevelsForPair() {
      if (!left || !right) return;
      try {
        const levels = await loadStructuralLevels([left.symbol, right.symbol]);
        if (!cancelled) setStructuralLevels(levels);
      } catch (reason) {
        if (!cancelled) setOperationMessage(reason instanceof Error ? reason.message : "Unable to load structural memory");
      }
    }
    void loadLevelsForPair();
    return () => { cancelled = true; };
  }, [left?.symbol, right?.symbol]);

  const useCurrentPairForStructuralLevel = () => {
    if (!left || !right) return;
    setStructuralForm({ ...structuralBlank, symbol: left.symbol, comparisonSymbol: right.symbol, label: `${left.symbol}/${right.symbol} structural level` });
  };
  const addCustomTicker = (side: "left" | "right", input: string) => {
    const node = customBenchmarkNode(input);
    if (!node) {
      setCustomError("Enter a ticker, optionally as VENUE:TICKER.");
      return;
    }
    setCustomError("");
    setCustomNodes((current) => [node, ...current.filter((item) => item.id !== node.id)].slice(0, 24));
    if (side === "left") {
      setCustomLeftInput("");
      setLeftBenchmarkId(node.id);
      setLeftId("");
    } else {
      setCustomRightInput("");
      setRightBenchmarkId(node.id);
      setRightId("");
    }
  };

  const saveStructuralLevel = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!left || !right) return;
    setStructuralBusy(true);
    setOperationMessage("");
    try {
      const response = await fetch("/api/structural-levels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...structuralForm,
          id: structuralForm.id || undefined,
          symbol: (structuralForm.symbol || left.symbol).toUpperCase(),
          comparisonSymbol: (structuralForm.comparisonSymbol || right.symbol).toUpperCase(),
          level: Number(structuralForm.level),
          source: structuralForm.source || null,
          notes: structuralForm.notes || null,
          asOfDate: structuralForm.asOfDate || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Unable to save structural level");
      setStructuralLevels(await loadStructuralLevels([left.symbol, right.symbol]));
      setStructuralForm(structuralBlank);
      setOperationMessage("Structural level saved.");
    } catch (reason) {
      setOperationMessage(reason instanceof Error ? reason.message : "Unable to save structural level");
    } finally {
      setStructuralBusy(false);
    }
  };

  const editStructuralLevel = (level: StructuralLevel) => {
    setStructuralForm({
      id: level.id,
      symbol: level.symbol,
      comparisonSymbol: level.comparisonSymbol,
      label: level.label,
      timeframe: level.timeframe,
      direction: level.direction,
      level: String(level.level),
      status: level.status,
      source: level.source ?? "",
      notes: level.notes ?? "",
      asOfDate: level.asOfDate ?? "",
    });
  };

  const deleteStructuralLevel = async (level: StructuralLevel) => {
    if (!window.confirm(`Delete structural level ${level.label}?`)) return;
    setStructuralBusy(true);
    try {
      const response = await fetch(`/api/structural-levels?id=${encodeURIComponent(level.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Unable to delete structural level");
      if (left && right) setStructuralLevels(await loadStructuralLevels([left.symbol, right.symbol]));
      if (structuralForm.id === level.id) setStructuralForm(structuralBlank);
      setOperationMessage("Structural level deleted.");
    } catch (reason) {
      setOperationMessage(reason instanceof Error ? reason.message : "Unable to delete structural level");
    } finally {
      setStructuralBusy(false);
    }
  };

  const copyRatioExpression = async () => {
    if (!ratioTvExpression) return;
    setCopiedRatio(false);
    try {
      await navigator.clipboard.writeText(ratioTvExpression);
      setCopiedRatio(true);
      window.setTimeout(() => setCopiedRatio(false), 1600);
    } catch {
      setOperationMessage(`TV ratio expression: ${ratioTvExpression}`);
    }
  };

  const backfillSelected = async () => {
    if (!left || !right) return;
    setBackfillBusy(true);
    setOperationMessage("");
    setError("");
    try {
      const response = await fetch("/api/prices/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          range: "max",
          symbols: [
            selectedLeftBenchmark ? backfillKeyForBenchmark(selectedLeftBenchmark) : backfillKeyForHolding(left),
            selectedBenchmark ? backfillKeyForBenchmark(selectedBenchmark) : backfillKeyForHolding(right),
          ],
        }),
      });
      const payload = await response.json();
      if (!response.ok && payload.error) throw new Error(payload.error);
      const [overall, personal, smsf, storedPrices] = await Promise.all([
        loadDashboard("overall"),
        loadDashboard("personal"),
        loadDashboard("smsf"),
        loadStoredPrices(),
      ]);
      setDashboards({ overall, personal, smsf });
      setPrices(storedPrices.prices);
      setFxRates(storedPrices.fxRates);
      const warnings = Array.isArray(payload.errors) && payload.errors.length ? ` with warnings: ${payload.errors.slice(0, 2).join("; ")}` : "";
      setOperationMessage(`Backfilled ${payload.imported ?? 0} historical closes across all available provider history${warnings}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Historical backfill failed");
    } finally {
      setBackfillBusy(false);
    }
  };


  return (
    <main className="shell">
      <PageHeader
        title="Relative leadership"
        description="Compare one holding against another using stored closes, indexed return and the direct price ratio."
        links={[
          { href: "/", label: "State of play" },
          { href: "/holdings", label: "Capital" },
          { href: "/prices", label: "Pricing" },
          { href: "/fundamentals", label: "Fundamentals" },
        ]}
      />

      {loading ? (
        <Card><p className="empty">Loading comparison chart...</p></Card>
      ) : error ? (
        <Notice tone="error" title="Unable to load comparison">{error}</Notice>
      ) : left && right ? (
        <Card className="relativeWorkbench">
          <div className="panelHeader relativeHeader">
            <div>
              <p className="eyebrow">Comparison chart</p>
              <h2 className="cardTitle">{left.symbol} vs {right.symbol}</h2>
              <p className="cardIntro">{series.length} shared close{series.length === 1 ? "" : "s"} · {series.length ? `${dateLabel(series[0].date)} to ${dateLabel(series.at(-1)!.date)}` : "No overlapping price history yet"}</p>
            </div>
            <div className="relativeActions">
              <button className="button" type="button" onClick={backfillSelected} disabled={backfillBusy}>{backfillBusy ? "Backfilling..." : "Backfill history"}</button>
              {ratioTvExpression ? <button className="button" type="button" onClick={() => void copyRatioExpression()} title={ratioTvExpression}>{copiedRatio ? "Copied" : "Copy formula"}</button> : null}
              {ratioTv ? <a className="button" href={ratioTv} target="_blank" rel="noreferrer" title={`TradingView formula attempt: ${ratioTvExpression}`}>Try ratio in TV</a> : null}
              {leftTv ? <a className="button" href={leftTv} target="_blank" rel="noreferrer" title={leftTvSymbol}>{left.symbol} TV</a> : null}
              {rightTv ? <a className="button" href={rightTv} target="_blank" rel="noreferrer" title={rightTvSymbol}>{right.symbol} TV</a> : null}
            </div>
          </div>

          {operationMessage ? <p className="relativeMessage">{operationMessage}</p> : null}
          <div className="relativeControls">
            <div className="scopeSwitch" role="tablist" aria-label="Comparison scope">
              {scopes.map((item) => (
                <button key={item.key} type="button" className={scope === item.key ? "isActive" : ""} onClick={() => setScope(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>
            <label className="relativeSelect">
              <span>First asset</span>
              <select
                value={leftBenchmarkId ? selectionValue("benchmark", leftBenchmarkId) : selectionValue("holding", leftHolding?.id ?? "")}
                onChange={(event) => {
                  const selection = parseSelectionValue(event.target.value);
                  if (!selection) return;
                  if (selection.kind === "benchmark") { setLeftBenchmarkId(selection.id); setLeftId(""); }
                  else { setLeftBenchmarkId(""); setLeftId(selection.id); }
                }}
              >
                <option value="" disabled>Choose first asset</option>
                <ComparisonOptionGroups permanent={permanentBenchmarkNodes} custom={customNodes} savedGroups={savedIdeaGroups} side="left" />
                <optgroup label="Holdings">
                  {holdings.map((holding) => (
                    <option key={holding.id} value={selectionValue("holding", holding.id)}>{holding.symbol} · {sectorForInstrument(holding)} · {money(holding.marketValueAud)}</option>
                  ))}
                </optgroup>
              </select>
              <form
                className="relativeCustomSymbol"
                onSubmit={(event) => {
                  event.preventDefault();
                  addCustomTicker("left", customLeftInput);
                }}
              >
                <input
                  value={customLeftInput}
                  onChange={(event) => setCustomLeftInput(event.target.value)}
                  placeholder="Add ticker"
                  aria-label="Ticker to use as first asset"
                />
                <button className="button" type="submit">Add left</button>
              </form>
            </label>
            <label className="relativeSelect">
              <span>Second asset</span>
              <select
                value={rightBenchmarkId ? selectionValue("benchmark", rightBenchmarkId) : selectionValue("holding", rightHolding?.id ?? "")}
                onChange={(event) => {
                  const selection = parseSelectionValue(event.target.value);
                  if (!selection) return;
                  if (selection.kind === "benchmark") { setRightBenchmarkId(selection.id); setRightId(""); }
                  else { setRightBenchmarkId(""); setRightId(selection.id); }
                }}
              >
                <option value="" disabled>Choose second asset</option>
                <ComparisonOptionGroups permanent={permanentBenchmarkNodes} custom={customNodes} savedGroups={savedIdeaGroups} side="right" />
                <optgroup label="Holdings">
                  {holdings.map((holding) => (
                    <option key={holding.id} value={selectionValue("holding", holding.id)}>{holding.symbol} · {sectorForInstrument(holding)} · {money(holding.marketValueAud)}</option>
                  ))}
                </optgroup>
              </select>
              <form
                className="relativeCustomSymbol"
                onSubmit={(event) => {
                  event.preventDefault();
                  addCustomTicker("right", customRightInput);
                }}
              >
                <input
                  value={customRightInput}
                  onChange={(event) => setCustomRightInput(event.target.value)}
                  placeholder="Add ticker"
                  aria-label="Ticker to use as second asset"
                />
                <button className="button" type="submit">Add right</button>
              </form>
            </label>
          </div>
          {customError ? <p className="relativeCustomError">{customError}</p> : null}
          <SummaryGrid
            entries={[
              ["Ratio move", percent(ratioChange), ratioChange >= 0 ? "positive" : "negative"],
              [`${left.symbol} move`, percent(leftChange), leftChange >= 0 ? "positive" : "negative"],
              [`${right.symbol} move`, percent(rightChange), rightChange >= 0 ? "positive" : "negative"],
              ["Shared closes", series.length],
              strengthEntry,
              velocityEntry,
            ]}
          />

          {relativeEngine ? <RelativeScorePanel score={relativeEngine} /> : null}

          {ratioTvExpression ? (
            <div className="relativeTvPanel isPrimary">
              <div className="relativeTvHeader">
                <div>
                  <p className="eyebrow">TradingView workbench</p>
                  <h3>{left.symbol}/{right.symbol}</h3>
                  <span>{ratioTvExpression}</span>
                </div>
                <div className="relativeActions">
                  <a className="button" href={ratioTv} target="_blank" rel="noreferrer" title={ratioTvExpression}>Open ratio</a>
                  {leftTv ? <a className="button" href={leftTv} target="_blank" rel="noreferrer" title={leftTvSymbol}>{left.symbol}</a> : null}
                  {rightTv ? <a className="button" href={rightTv} target="_blank" rel="noreferrer" title={rightTvSymbol}>{right.symbol}</a> : null}
                </div>
              </div>
              <TradingViewWidget
                symbol={ratioTvExpression}
                className="tradingview-widget-container stockChartWidget relativeTvWidget"
                minHeight={560}
                maxHeight={760}
                compactMinHeight={380}
                compactMaxHeight={520}
                heightRatio={0.76}
                compactHeightRatio={0.62}
              />
              <p className="relativeTvNote">If TradingView opens search or an unknown symbol for this formula, use the individual asset buttons above.</p>
            </div>
          ) : null}

          <div className="relativePeriodEvidence" aria-label="Relative return evidence by period">
            <div className="relativePeriodHeader">
              <p className="eyebrow">SouthernStar evidence</p>
              <span>AUD-adjusted stored closes. Positive means {left.symbol} outperformed {right.symbol}. 3M pair trend: {periodPercent(pairThreeMonth)}</span>
            </div>
            <div className="relativePeriodGrid">
              {evidenceWindows.map((window) => (
                <RelativePeriodCell key={window.key} window={window} left={left.symbol} right={right.symbol} />
              ))}
            </div>
          </div>

          <details className="relativeAuditPanel">
            <summary>Stored-close audit chart</summary>
            <div className="relativeModeBar">
              <div className="scopeSwitch" role="tablist" aria-label="Chart mode">
                <button type="button" className={mode === "ratio" ? "isActive" : ""} onClick={() => setMode("ratio")}>Ratio</button>
                <button type="button" className={mode === "indexed" ? "isActive" : ""} onClick={() => setMode("indexed")}>Indexed</button>
              </div>
              <div className="scopeSwitch" role="tablist" aria-label="Chart range">
                {ranges.map((item) => (
                  <button key={item.key} type="button" className={range === item.key ? "isActive" : ""} onClick={() => setRange(item.key)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {series.length >= 2 ? (
              <RatioChart series={series} mode={mode} left={left} right={right} />
            ) : (
              <div className="relativeEmpty">
                <strong>No overlapping stored closes</strong>
                <span>SouthernStar has fewer than two usable comparison dates. Use Backfill history or choose another pair.</span>
              </div>
            )}
          </details>
          <div className="relativeStructurePanel">
            <div className="relativeStructureHeader">
              <div>
                <p className="eyebrow">Structural memory</p>
                <h3>{left.symbol}/{right.symbol} levels</h3>
              </div>
              <button className="button" type="button" onClick={useCurrentPairForStructuralLevel}>Use current pair</button>
            </div>
            {pairStructuralLevels.length ? (
              <div className="relativeStructureList">
                {pairStructuralLevels.map((level) => (
                  <div className="relativeStructureRow" key={level.id}>
                    <div>
                      <strong>{level.label}</strong>
                      <span>{level.symbol}/{level.comparisonSymbol} · {level.timeframe} · {level.direction} · {level.status.replace("_", " ")}</span>
                      {level.notes ? <em>{level.notes}</em> : null}
                    </div>
                    <div>
                      <strong>{level.level.toLocaleString("en-AU", { maximumFractionDigits: 4 })}</strong>
                      <button type="button" onClick={() => editStructuralLevel(level)}>Edit</button>
                      <button type="button" onClick={() => void deleteStructuralLevel(level)} disabled={structuralBusy}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="relativeMessage">No stored structural levels for this pair yet.</p>
            )}
            <form className="relativeStructureForm" onSubmit={saveStructuralLevel}>
              <label><span>Symbol</span><input value={structuralForm.symbol} onChange={(event) => setStructuralForm({ ...structuralForm, symbol: event.target.value.toUpperCase() })} placeholder={left.symbol} /></label>
              <label><span>Versus</span><input value={structuralForm.comparisonSymbol} onChange={(event) => setStructuralForm({ ...structuralForm, comparisonSymbol: event.target.value.toUpperCase() })} placeholder={right.symbol} /></label>
              <label><span>Label</span><input value={structuralForm.label} onChange={(event) => setStructuralForm({ ...structuralForm, label: event.target.value })} required /></label>
              <label><span>Level</span><input type="number" min="0" step="0.0001" value={structuralForm.level} onChange={(event) => setStructuralForm({ ...structuralForm, level: event.target.value })} required /></label>
              <label><span>Timeframe</span><select value={structuralForm.timeframe} onChange={(event) => setStructuralForm({ ...structuralForm, timeframe: event.target.value as StructuralLevel["timeframe"] })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="secular">Secular</option></select></label>
              <label><span>Type</span><select value={structuralForm.direction} onChange={(event) => setStructuralForm({ ...structuralForm, direction: event.target.value as StructuralLevel["direction"] })}><option value="resistance">Resistance</option><option value="support">Support</option></select></label>
              <label><span>Status</span><select value={structuralForm.status} onChange={(event) => setStructuralForm({ ...structuralForm, status: event.target.value as StructuralLevel["status"] })}><option value="watching">Watching</option><option value="broken">Broken</option><option value="retest_held">Retest held</option><option value="failed">Failed</option><option value="invalidated">Invalidated</option></select></label>
              <label><span>As of</span><input type="date" value={structuralForm.asOfDate} onChange={(event) => setStructuralForm({ ...structuralForm, asOfDate: event.target.value })} /></label>
              <label className="isWide"><span>Source</span><input value={structuralForm.source} onChange={(event) => setStructuralForm({ ...structuralForm, source: event.target.value })} placeholder="Chart note, newsletter, manual level" /></label>
              <label className="isWide"><span>Notes</span><textarea value={structuralForm.notes} onChange={(event) => setStructuralForm({ ...structuralForm, notes: event.target.value })} rows={3} /></label>
              <div className="buttonRow">
                <button className="primary" type="submit" disabled={structuralBusy}>{structuralForm.id ? "Update level" : "Save level"}</button>
                {structuralForm.id ? <button type="button" onClick={() => setStructuralForm(structuralBlank)}>Cancel</button> : null}
              </div>
            </form>
          </div>
        </Card>
      ) : (
        <Card><p className="empty">No chartable holdings are available.</p></Card>
      )}
    </main>
  );
}
