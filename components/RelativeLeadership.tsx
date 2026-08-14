"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import type { DashboardData, DashboardHolding, Scope, StoredDailyPrice, StoredFxRate } from "@/lib/storage";
import { Card, Notice, SummaryGrid } from "@/northstar/components";
import { applyRatioRange, buildInstrumentHistory, buildRatioSeries, RATIO_RANGES, type RatioPoint, type RatioRangeKey } from "@/northstar/lib/ratio-engine";
import { sectorForInstrument } from "@/northstar/lib/sector-map";
import { tradingViewChartUrl, tradingViewSymbolForInstrument } from "@/northstar/lib/tradingview";

type DashboardMap = Partial<Record<Scope, DashboardData>>;
type PriceBookResponse = {
  prices?: StoredDailyPrice[];
  fxRates?: StoredFxRate[];
  error?: string;
};
type RatioMode = "ratio" | "indexed";
type RangeKey = Extract<RatioRangeKey, "all" | "6m" | "3m" | "1m">;

const scopes: Array<{ key: Scope; label: string }> = [
  { key: "overall", label: "Overall" },
  { key: "personal", label: "Personal" },
  { key: "smsf", label: "SMSF" },
];

const ranges: Array<{ key: RangeKey; label: string; days: number | null }> = RATIO_RANGES.filter((item) => ["all", "6m", "3m", "1m"].includes(item.key)) as Array<{ key: RangeKey; label: string; days: number | null }>;

const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

const localPrice = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString("en-AU", {
    minimumFractionDigits: value >= 100 ? 2 : 3,
    maximumFractionDigits: value >= 100 ? 2 : 4,
  })}`;

const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;

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

function isChartable(holding: DashboardHolding) {
  return holding.symbol !== "CASH" && holding.exchange !== "CASH" && holding.lastPrice != null && holding.lastPrice > 0;
}

function defaultSymbol(rows: DashboardHolding[], fallbackIndex: number) {
  return rows[fallbackIndex]?.id ?? rows[0]?.id ?? "";
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
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 100);
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
              <text className="relativeChartAxis" x={padX + chartWidth - 5} y={Math.max(12, y - 6)} textAnchor="end">{tick.toFixed(1)}</text>
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

export default function RelativeLeadership() {
  const [dashboards, setDashboards] = useState<DashboardMap>({});
  const [prices, setPrices] = useState<StoredDailyPrice[]>([]);
  const [fxRates, setFxRates] = useState<StoredFxRate[]>([]);
  const [scope, setScope] = useState<Scope>("overall");
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [mode, setMode] = useState<RatioMode>("ratio");
  const [range, setRange] = useState<RangeKey>("all");
  const [loading, setLoading] = useState(true);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [operationMessage, setOperationMessage] = useState("");
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
    if (!holdings.some((holding) => holding.id === leftId)) setLeftId(defaultSymbol(holdings, 0));
    if (!holdings.some((holding) => holding.id === rightId)) setRightId(defaultSymbol(holdings, 1));
  }, [holdings, leftId, rightId]);

  const left = holdings.find((holding) => holding.id === leftId) ?? holdings[0];
  const right = holdings.find((holding) => holding.id === rightId) ?? holdings[1] ?? holdings[0];
  const leftHistory = left ? historyForHolding(prices, fxRates, left) : [];
  const rightHistory = right ? historyForHolding(prices, fxRates, right) : [];
  const fullSeries = left && right ? buildRatioSeries(leftHistory, rightHistory) : [];
  const series = applyRatioRange(fullSeries, range);
  const first = series[0];
  const last = series.at(-1);
  const ratioChange = first && last ? last.ratio / first.ratio * 100 - 100 : 0;
  const leftChange = first && last ? last.leftIndexed - 100 : 0;
  const rightChange = first && last ? last.rightIndexed - 100 : 0;
  const leftTv = left ? tradingViewChartUrl(tradingViewSymbolForInstrument(left)) : "";
  const rightTv = right ? tradingViewChartUrl(tradingViewSymbolForInstrument(right)) : "";

  const backfillSelected = async () => {
    if (!left || !right) return;
    setBackfillBusy(true);
    setOperationMessage("");
    setError("");
    try {
      const response = await fetch("/api/prices/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ range: "1y", symbols: [left.symbol, right.symbol] }),
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
              {leftTv ? <a className="button" href={leftTv} target="_blank" rel="noreferrer">{left.symbol} TV</a> : null}
              {rightTv ? <a className="button" href={rightTv} target="_blank" rel="noreferrer">{right.symbol} TV</a> : null}
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
              <span>First holding</span>
              <select value={left?.id ?? ""} onChange={(event) => setLeftId(event.target.value)}>
                {holdings.map((holding) => (
                  <option key={holding.id} value={holding.id}>{holding.symbol} · {sectorForInstrument(holding)} · {money(holding.marketValueAud)}</option>
                ))}
              </select>
            </label>
            <label className="relativeSelect">
              <span>Second holding</span>
              <select value={right?.id ?? ""} onChange={(event) => setRightId(event.target.value)}>
                {holdings.map((holding) => (
                  <option key={holding.id} value={holding.id}>{holding.symbol} · {sectorForInstrument(holding)} · {money(holding.marketValueAud)}</option>
                ))}
              </select>
            </label>
          </div>

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

          {series.length >= 2 ? (
            <RatioChart series={series} mode={mode} left={left} right={right} />
          ) : (
            <div className="relativeEmpty">
              <strong>No overlapping stored closes</strong>
              <span>NorthStar has fewer than two usable comparison dates. Use Backfill 1Y or choose another pair.</span>
            </div>
          )}
        </Card>
      ) : (
        <Card><p className="empty">No chartable holdings are available.</p></Card>
      )}
    </main>
  );
}
