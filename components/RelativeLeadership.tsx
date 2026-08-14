"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import type { DashboardData, DashboardHolding, OwnerType, Scope, StoredDailyPrice, StoredFxRate, StructuralLevel } from "@/lib/storage";
import { Card, Notice, SummaryGrid } from "@/northstar/components";
import { RESEARCH_BENCHMARKS, resolveBenchmarkTree, type BenchmarkNode } from "@/northstar/lib/benchmark-tree";
import { applyRatioRange, buildInstrumentHistory, buildRatioSeries, relativeReturnWindows, RATIO_RANGES, type RatioPoint, type RatioRangeKey, type RelativeReturnWindow } from "@/northstar/lib/ratio-engine";
import { sectorForInstrument } from "@/northstar/lib/sector-map";
import { tradingViewChartUrl, tradingViewRatioChartUrl, tradingViewRatioExpression, tradingViewSymbolForInstrument } from "@/northstar/lib/tradingview";

type DashboardMap = Partial<Record<Scope, DashboardData>>;
type PriceBookResponse = {
  prices?: StoredDailyPrice[];
  fxRates?: StoredFxRate[];
  error?: string;
};
type StructuralLevelsResponse = { levels?: StructuralLevel[]; error?: string };
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
type RangeKey = Extract<RatioRangeKey, "all" | "12m" | "6m" | "3m" | "1m">;

const scopes: Array<{ key: Scope; label: string }> = [
  { key: "overall", label: "Overall" },
  { key: "personal", label: "Personal" },
  { key: "smsf", label: "SMSF" },
];

const ranges: Array<{ key: RangeKey; label: string; days: number | null }> = RATIO_RANGES.filter((item) => ["all", "12m", "6m", "3m", "1m"].includes(item.key)) as Array<{ key: RangeKey; label: string; days: number | null }>;
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
export default function RelativeLeadership() {
  const [dashboards, setDashboards] = useState<DashboardMap>({});
  const [prices, setPrices] = useState<StoredDailyPrice[]>([]);
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
        const [overall, personal, smsf, storedPrices] = await Promise.all([
          loadDashboard("overall"),
          loadDashboard("personal"),
          loadDashboard("smsf"),
          loadStoredPrices(),
        ]);
        if (!cancelled) {
          setDashboards({ overall, personal, smsf });
          setPrices(storedPrices.prices);
          setFxRates(storedPrices.fxRates);
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

  const leftHolding = holdings.find((holding) => holding.id === leftId) ?? null;
  const selectedLeftBenchmark = RESEARCH_BENCHMARKS.find((node) => node.id === leftBenchmarkId) ?? null;
  const left = selectedLeftBenchmark ? benchmarkInstrument(selectedLeftBenchmark) : leftHolding ?? holdings[0];
  const tree = left ? resolveBenchmarkTree({ symbol: left.symbol, name: left.name, sector: sectorForInstrument(left), exchange: left.exchange, currency: left.currency }) : null;
  const benchmarkNodes = tree ? mergeBenchmarkNodes([...tree.path, ...tree.peers, ...RESEARCH_BENCHMARKS]).filter(nodeIsChartable) : RESEARCH_BENCHMARKS.filter(nodeIsChartable);
  const selectedBenchmark = benchmarkNodes.find((node) => node.id === rightBenchmarkId) ?? null;
  const rightHolding = holdings.find((holding) => holding.id === rightId) ?? null;
  const right = selectedBenchmark ? benchmarkInstrument(selectedBenchmark) : rightHolding ?? holdings[1] ?? holdings[0];
  const leftHistory = historyForComparison(prices, fxRates, selectedLeftBenchmark ? null : left, selectedLeftBenchmark);
  const rightHistory = historyForComparison(prices, fxRates, selectedBenchmark ? null : right, selectedBenchmark);
  const fullSeries = left && right ? buildRatioSeries(leftHistory, rightHistory) : [];
  const series = applyRatioRange(fullSeries, range);
  const evidenceWindows = useMemo(() => relativeReturnWindows(fullSeries, evidenceRanges), [fullSeries]);
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
          range: "1y",
          symbols: [
            backfillKeyForHolding(left),
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
      setOperationMessage(`Backfilled ${payload.imported ?? 0} historical closes${warnings}.`);
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
              <button className="button" type="button" onClick={backfillSelected} disabled={backfillBusy}>{backfillBusy ? "Backfilling..." : "Backfill 1Y"}</button>
              {ratioTvExpression ? <button className="button" type="button" onClick={() => void copyRatioExpression()} title={ratioTvExpression}>{copiedRatio ? "Copied" : "Copy formula"}</button> : null}
              {ratioTv ? <a className="button" href={ratioTv} target="_blank" rel="noreferrer" title={`TradingView formula attempt: ${ratioTvExpression}`}>Try ratio in TV</a> : null}
              {leftTv ? <a className="button" href={leftTv} target="_blank" rel="noreferrer" title={leftTvSymbol}>{left.symbol} TV</a> : null}
              {rightTv ? <a className="button" href={rightTv} target="_blank" rel="noreferrer" title={rightTvSymbol}>{right.symbol} TV</a> : null}
            </div>
          </div>

          {operationMessage ? <p className="relativeMessage">{operationMessage}</p> : null}
          {ratioTvExpression ? <p className="relativeMessage">TV ratio expression: {ratioTvExpression}. TradingView may reject some formula symbols; use the individual TV buttons if it opens a search or unknown symbol.</p> : null}

          <div className="relativeControls">
            <div className="scopeSwitch" role="tablist" aria-label="Comparison scope">
              {scopes.map((item) => (
                <button key={item.key} type="button" className={scope === item.key ? "isActive" : ""} onClick={() => setScope(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>
            <label className="relativeSelect">
              <span>First holding</span>
              <select value={leftBenchmarkId ? "" : leftHolding?.id ?? ""} onChange={(event) => { setLeftBenchmarkId(""); setLeftId(event.target.value); }}>
                <option value="" disabled>{leftBenchmarkId ? "Research benchmark selected below" : "Choose holding"}</option>
                {holdings.map((holding) => (
                  <option key={holding.id} value={holding.id}>{holding.symbol} · {sectorForInstrument(holding)} · {money(holding.marketValueAud)}</option>
                ))}
              </select>
            </label>
            <label className="relativeSelect">
              <span>Second holding</span>
              <select value={rightBenchmarkId ? "" : rightHolding?.id ?? ""} onChange={(event) => { setRightBenchmarkId(""); setRightId(event.target.value); }}>
                <option value="" disabled>{rightBenchmarkId ? "Benchmark selected below" : "Choose holding"}</option>
                {holdings.map((holding) => (
                  <option key={holding.id} value={holding.id}>{holding.symbol} · {sectorForInstrument(holding)} · {money(holding.marketValueAud)}</option>
                ))}
              </select>
            </label>
          </div>

          {tree ? (
            <div className="relativeBenchmarkPath" aria-label="Benchmark path">
              <div>
                <span className="relativeBenchmarkLabel">Benchmark tree</span>
                <strong>{tree.sector}</strong>
              </div>
              <div className="relativeBenchmarkNodes">
                {tree.path.map((node) => (
                  <button key={node.id} type="button" disabled={!nodeIsChartable(node)} className={rightBenchmarkId === node.id ? "isActive" : ""} onClick={() => { setRightBenchmarkId(node.id); setRightId(""); }}>
                    <span>{node.role.replace("_", " ")}</span>
                    <strong>{node.symbol ?? node.label}</strong>
                  </button>
                ))}
              </div>
              {benchmarkNodes.length ? (
                <div className="relativePeerNodes">
                  {benchmarkNodes.filter((node) => !tree.path.some((pathNode) => pathNode.id === node.id)).map((node) => nodeIsChartable(node) ? (
                    <button key={node.id} type="button" className={rightBenchmarkId === node.id ? "isActive" : ""} onClick={() => { setRightBenchmarkId(node.id); setRightId(""); }}>
                      {node.symbol ?? node.label}
                    </button>
                  ) : null)}
                </div>
              ) : null}
              {tree.notes.length ? <p>{tree.notes[0]}</p> : null}
              <div className="relativeResearchSet">
                <span>Use research candidate as first asset</span>
                <div className="relativePeerNodes">
                  {RESEARCH_BENCHMARKS.map((node) => (
                    <button key={node.id + ":left"} type="button" className={leftBenchmarkId === node.id ? "isActive" : ""} onClick={() => { setLeftBenchmarkId(node.id); setLeftId(""); }} title={node.label}>
                      {node.symbol ?? node.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

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

          <SummaryGrid
            entries={[
              ["Ratio move", percent(ratioChange), ratioChange >= 0 ? "positive" : "negative"],
              [`${left.symbol} move`, percent(leftChange), leftChange >= 0 ? "positive" : "negative"],
              [`${right.symbol} move`, percent(rightChange), rightChange >= 0 ? "positive" : "negative"],
              ["Shared closes", series.length],
            ]}
          />

          <div className="relativePeriodEvidence" aria-label="Relative return evidence by period">
            <div className="relativePeriodHeader">
              <p className="eyebrow">Period evidence</p>
              <span>AUD-adjusted ratio return. Positive means {left.symbol} outperformed {right.symbol}.</span>
            </div>
            <div className="relativePeriodGrid">
              {evidenceWindows.map((window) => (
                <RelativePeriodCell key={window.key} window={window} left={left.symbol} right={right.symbol} />
              ))}
            </div>
          </div>

          {series.length >= 2 ? (
            <RatioChart series={series} mode={mode} left={left} right={right} />
          ) : (
            <div className="relativeEmpty">
              <strong>No overlapping stored closes</strong>
              <span>NorthStar has fewer than two usable comparison dates. Use Backfill 1Y or choose another pair.</span>
            </div>
          )}

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
