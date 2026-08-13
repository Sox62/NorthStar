"use client";

import React, { useEffect, useMemo, useState } from "react";
import TradingViewWidget from "@/components/TradingViewWidget";
import { NavDetailPanel } from "./NavDetailPanel";
import { ScopeTabs } from "./ScopeTabs";
import { StateOfPlayCards } from "./StateOfPlayCards";
import { buildNavSeries, valueForScope, type ChartValueMode, type PerformancePoint } from "../lib/nav-series";
import { allocationDriftForSectors, type AllocationDriftSummary, type AllocationTarget } from "../lib/allocation-drift";
import { dataHealth, type HealthTone } from "../lib/data-health";
import { byScope, bySector, fmtAud, totals } from "../lib/portfolio-metrics";
import { compareNumber, compareText, nextSort, sortIndicator, type SortState } from "../lib/sort";
import { tradingViewChartUrl, tradingViewSymbolForInstrument } from "../lib/tradingview";
import { SECTOR_COLORS, type Holding, type PortfolioScope, type Sector } from "../types";

type SyncRunSummary = {
  source: string;
  trigger: string;
  status: "success" | "partial" | "failed" | "skipped";
  finishedAt: string;
  message: string | null;
  error: string | null;
};
type FreshnessStatus = "fresh" | "stale" | "missing" | "fallback";
type ValuationFreshnessSummary = {
  source: string;
  status: FreshnessStatus;
  asOf: string | null;
  ageDays: number | null;
  staleAfterDays: number | null;
  detail: string;
};
type PeriodReturnSummary = {
  key: "daily" | "mtd" | "ytd" | "since_inception";
  label: string;
  valueAud: number | null;
  valuePercent: number | null;
  startDate: string | null;
  endDate: string | null;
  note: string;
};
type CurrencyExposureSummary = {
  currency: string;
  amountAud: number;
  valuePercent: number;
  positionValueAud: number;
  cashValueAud: number;
  positionCount: number;
};
type BrokerShareTotal = {
  broker: string;
  value: number;
  positionCount: number;
};

type AccountBreakdownSummary = {
  scope: "personal" | "smsf";
  label: string;
  netAssetValue: number;
  investedValue: number;
  cashValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  positionCount: number;
  sharePositionValue: number;
  brokerShareTotals: BrokerShareTotal[];
  shareOfOverall: number;
  lastUpdated: string | null;
};
type IncomeSummary = {
  periodStart: string;
  periodEnd: string;
  dividendCount: number;
  netCashAud: number;
  taxWithheldAud: number;
  frankingCreditsAud: number;
  grossIncomeAud: number;
  grossedUpYieldPercent: number | null;
  symbols: Array<{
    symbol: string;
    payments: number;
    netCashAud: number;
    taxWithheldAud: number;
    frankingCreditsAud: number;
    grossIncomeAud: number;
  }>;
  note: string;
};
type CommodityExposureSummary = {
  name: string;
  value: number;
  positionCount: number;
  color: string;
};

const commodityBySector: Record<Sector, { name: string; color: string }> = {
  "Silver miners": { name: "Silver", color: "#b9c4d0" },
  "Silver bullion": { name: "Silver", color: "#e3e9f0" },
  "Gold miners": { name: "Gold", color: "#d7b56d" },
  "Uranium miners": { name: "Uranium", color: "#8dc6a0" },
  "Uranium explorers": { name: "Uranium", color: "#5fbf8f" },
  Technology: { name: "Technology", color: "#77a9d8" },
  "Broad equities": { name: "Broad equities", color: "#9aa9ba" },
  "Platinum bullion": { name: "Physical platinum", color: "#8fa6bf" },
  "Rhodium metal": { name: "Rhodium", color: "#c78db8" },
  Oil: { name: "Oil", color: "#dd8b6f" },
  Cash: { name: "Cash", color: "#5d6f81" },
};

function pct(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

function fmtPct(value: number) {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function fmtSignedAud(value: number) {
  return `${value >= 0 ? "+" : ""}${fmtAud(value)}`;
}

function fmtSignedPct(value: number | null) {
  if (value == null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}


function fmtLatestPrice(holding: Holding) {
  if (holding.lastPrice == null) return "No price";
  const currency = holding.priceCurrency ?? "AUD";
  const value = holding.lastPrice.toLocaleString("en-AU", {
    minimumFractionDigits: holding.lastPrice >= 100 ? 2 : 3,
    maximumFractionDigits: holding.lastPrice >= 100 ? 2 : 4,
  });
  return `${currency} ${value}`;
}

function foreignCurrencyAuditHoldings(holdings: Holding[]) {
  return holdings
    .filter((holding) => (holding.priceCurrency ?? "AUD") !== "AUD" && isShareLike(holding))
    .sort((a, b) => Math.abs(b.marketValueAud) - Math.abs(a.marketValueAud));
}

type MetalQuote = {
  metal: "gold" | "silver" | "platinum";
  label: string;
  value: number | null;
  priceDate: string | null;
  source: string;
  color: string;
  tradingViewSymbol: string;
};

type MetalSpotApiQuote = {
  metal: "gold" | "silver" | "platinum";
  label: string;
  price: number;
  priceDate: string;
  source: string;
};

const metalQuoteShells: MetalQuote[] = [
  { metal: "gold", label: "Gold spot", value: null, priceDate: null, source: "Loading", color: SECTOR_COLORS["Gold miners"], tradingViewSymbol: "TVC:GOLD" },
  { metal: "silver", label: "Silver spot", value: null, priceDate: null, source: "Loading", color: SECTOR_COLORS["Silver bullion"], tradingViewSymbol: "TVC:SILVER" },
  { metal: "platinum", label: "Platinum spot", value: null, priceDate: null, source: "Loading", color: SECTOR_COLORS["Platinum bullion"], tradingViewSymbol: "TVC:PLATINUM" },
];

function fmtMetalPrice(quote: MetalQuote) {
  if (quote.value == null) return "n/a";
  return `USD ${quote.value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/oz`;
}

function dayGainPercent(holding: Holding) {
  const gain = holding.dayGainAud ?? 0;
  const previousValue = holding.marketValueAud - gain;
  return previousValue ? (gain / previousValue) * 100 : null;
}

function fmtShortAud(value: number) {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return fmtAud(value);
}

type HoldingSortKey = "holding" | "sector" | "price" | "value" | "weight" | "day" | "pnl";
type HoldingSortState = SortState<HoldingSortKey>;


function fmtDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
  }).format(date);
}

function fmtLongDate(value: string | null | undefined) {
  if (!value) return "date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function fmtChartLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

const overviewAscendingSorts: HoldingSortKey[] = ["holding", "sector"];

function sortHoldings(holdings: Holding[], sort: HoldingSortState, total: number) {
  const valueFor = (holding: Holding) => {
    switch (sort.key) {
      case "price": return holding.lastPrice ?? Number.NEGATIVE_INFINITY;
      case "value": return holding.marketValueAud;
      case "weight": return pct(holding.marketValueAud, total);
      case "day": return holding.dayGainAud ?? 0;
      case "pnl": return holding.pnlAud;
      default: return 0;
    }
  };
  return [...holdings].sort((left, right) => {
    if (sort.key === "holding") {
      const result = compareText(left.symbol, right.symbol) || compareText(left.name, right.name);
      return sort.direction === "desc" ? -result : result;
    }
    if (sort.key === "sector") {
      const sectorResult = compareText(sectorShortName(left.sector), sectorShortName(right.sector));
      if (sectorResult) return sort.direction === "desc" ? -sectorResult : sectorResult;
      return compareNumber(left.marketValueAud, right.marketValueAud, "desc");
    }
    return compareNumber(valueFor(left), valueFor(right), sort.direction) || compareText(left.symbol, right.symbol);
  });
}
function sectorShortName(sector: Sector) {
  return sector.replace(" miners", "").replace(" bullion", "");
}

// The share tables list what is held in a brokerage account, so the test is how a holding
// is held rather than what it tracks. Physical metal is a manual asset and cash is not a
// position; metal-backed ETCs such as XRH0 and ETPMAG are listed securities with a ticker,
// a live price and a P/L, and belong here alongside SILJ and GDX.
const PHYSICAL_BROKER = "Physical";

function isShareLike(holding: Holding) {
  return holding.sector !== "Cash" && holding.broker !== PHYSICAL_BROKER;
}

type HoldingAccountGroup = {
  key: string;
  label: string;
  detail: string;
  value: number;
  holdings: Holding[];
};

function brokerDisplayName(broker?: string) {
  const normalized = (broker ?? "Unknown").trim();
  if (normalized.toLowerCase() === "ibkr") return "IBKR";
  if (normalized.toLowerCase() === "directshares") return "Directshares";
  return normalized || "Unknown";
}

function accountGroupKey(holding: Holding) {
  return [
    holding.ownerType,
    brokerDisplayName(holding.broker),
    holding.accountKey ?? holding.accountLabel ?? "unknown",
  ].join(":");
}

function ownerDisplayName(ownerType: Holding["ownerType"]) {
  return ownerType === "SMSF" ? "SMSF" : "Personal";
}

function accountGroupLabel(holding: Holding) {
  const owner = ownerDisplayName(holding.ownerType);
  const broker = brokerDisplayName(holding.broker);
  return broker === "Unknown" ? owner : `${owner} ${broker}`;
}

function accountGroupDetail(group: HoldingAccountGroup) {
  const keys = [...new Set(group.holdings.map((holding) => holding.accountKey).filter(Boolean))];
  const account = keys.length === 1 ? ` · Account ${keys[0]}` : "";
  return `${group.holdings.length} position${group.holdings.length === 1 ? "" : "s"}${account}`;
}

function holdingAccountGroups(holdings: Holding[]): HoldingAccountGroup[] {
  const groups = new Map<string, HoldingAccountGroup>();
  for (const holding of holdings) {
    const key = accountGroupKey(holding);
    const existing = groups.get(key);
    if (existing) {
      existing.holdings.push(holding);
      existing.value += holding.marketValueAud;
      continue;
    }
    groups.set(key, {
      key,
      label: accountGroupLabel(holding),
      detail: "",
      value: holding.marketValueAud,
      holdings: [holding],
    });
  }
  return [...groups.values()]
    .map((group) => ({ ...group, detail: accountGroupDetail(group) }))
    .sort((a, b) => b.value - a.value);
}

function commodityExposureFor(holdings: Holding[]): CommodityExposureSummary[] {
  const buckets = new Map<string, CommodityExposureSummary>();
  for (const holding of holdings) {
    const meta = commodityBySector[holding.sector];
    const bucket = buckets.get(meta.name) ?? { name: meta.name, value: 0, positionCount: 0, color: meta.color };
    bucket.value += holding.marketValueAud;
    bucket.positionCount += 1;
    buckets.set(meta.name, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.value - a.value);
}

function makeDonut(sectors: Array<{ sector: Sector; value: number }>, total: number) {
  if (!total) return "conic-gradient(rgba(122,149,178,0.18) 0 100%)";
  let start = 0;
  const stops = sectors.map((sector) => {
    const end = start + pct(sector.value, total);
    const stop = `${SECTOR_COLORS[sector.sector]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function HistoryChart({ now, investedNow, scope, performance }: { now: number; investedNow: number; scope: PortfolioScope; performance: PerformancePoint[] }) {
  const [range, setRange] = useState<"all" | "6m" | "3m">("all");
  const [mode, setMode] = useState<ChartValueMode>("performance");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const width = 528;
  const baseline = 160;
  const chartNow = mode === "performance" ? 100 : mode === "shares" ? investedNow : now;
  const fullSeries = useMemo(
    () => buildNavSeries({ performance, scope, mode, range: "itd" }).map((point) => ({ label: point.date, value: point.value })),
    [mode, performance, scope],
  );
  const series = useMemo(() => {
    if (range === "all" || fullSeries.length < 2) return fullSeries;
    const days = range === "6m" ? 183 : 92;
    const dated = fullSeries.map((point) => ({ ...point, time: new Date(`${point.label}T12:00:00Z`).getTime() }));
    const latest = dated.findLast((point) => Number.isFinite(point.time));
    if (!latest) return fullSeries.slice(range === "6m" ? -183 : -92);
    const cutoff = latest.time - days * 24 * 60 * 60 * 1000;
    const filtered = dated.filter((point) => Number.isFinite(point.time) && point.time >= cutoff);
    return filtered.length >= 2 ? filtered : fullSeries.slice(range === "6m" ? -183 : -92);
  }, [fullSeries, range]);
  const values = series.length ? series.map((point) => point.value) : [chartNow];
  const peak = Math.max(chartNow, ...values);
  const floor = Math.min(...values, chartNow);
  const valueRange = Math.max(1, peak - floor);
  const points = (series.length >= 2 ? series : [{ label: "Now", value: chartNow }, { label: "Now", value: chartNow }]).map((point, index, all) => {
    const x = all.length === 1 ? width : (index / Math.max(1, all.length - 1)) * width;
    const y = 132 - ((point.value - floor) / valueRange) * 112;
    return { ...point, x, y };
  });
  const line = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const fill = `0,${baseline} ${line} ${width},${baseline}`;
  const last = points.at(-1);
  const active = hoverIndex == null ? null : points[hoverIndex];
  const gridValues = [peak, floor + valueRange / 2, floor];
  const monthLabels = points.filter((_, index) => {
    if (points.length <= 6) return true;
    return index % Math.max(1, Math.floor(points.length / 6)) === 0 || index === points.length - 1;
  }).slice(-7);
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(ratio * Math.max(0, points.length - 1)));
  };
  const clearHover = () => setHoverIndex(null);
  const title = mode === "performance" ? "Performance index" : mode === "shares" ? "Share price value" : "Total NAV";
  const formatChartValue = (value: number) => mode === "performance" ? `${value.toFixed(1)}` : fmtShortAud(value);
  const formatTooltipValue = (value: number) => mode === "performance" ? `${value.toFixed(2)} index · ${fmtPct(value - 100)}` : fmtAud(value);

  const chartSvg = (gradientId: string, label: string) => (
    <svg
      className="nsHistoryChart"
      width={width}
      height={172}
      viewBox="0 0 528 172"
      role="img"
      aria-label={label}
      onPointerMove={onPointerMove}
      onPointerLeave={clearHover}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#d7b56d" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#d7b56d" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridValues.map((value, index) => {
        const y = 132 - ((value - floor) / valueRange) * 112;
        return (
          <g key={`${value}-${index}-${gradientId}`}>
            <line className="nsChartGridLine" x1="0" x2={width} y1={y} y2={y} />
            <text className="nsChartAxisLabel" x={width - 4} y={Math.max(10, y - 5)} textAnchor="end">{formatChartValue(value)}</text>
          </g>
        );
      })}
      <polygon points={fill} fill={`url(#${gradientId})`} />
      <polyline points={line} fill="none" stroke="#d7b56d" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      {active && (
        <>
          <line className="nsChartCrosshair" x1={active.x} x2={active.x} y1="16" y2={baseline} />
          <circle className="nsChartActiveDot" cx={active.x} cy={active.y} r="5" />
        </>
      )}
      {!active && last && <circle cx={last.x} cy={last.y} r="4" fill="#d7b56d" />}
      <rect x="0" y="0" width={width} height="172" fill="transparent" />
    </svg>
  );

  const renderTooltip = () => active ? (
    <div
      className={`nsChartTooltip ${active.x > width * 0.66 ? "isLeft" : ""}`}
      style={{ left: `${(active.x / width) * 100}%`, top: `${Math.max(8, Math.min(72, (active.y / 172) * 100))}%` }}
    >
      <span>{fmtChartLabel(active.label)}</span>
      <strong>{formatTooltipValue(active.value)}</strong>
    </div>
  ) : null;

  const openOnKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded(true);
    }
  };

  return (
    <div className="nsHistoryPanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">{mode === "performance" ? "Performance — since inception" : mode === "shares" ? "Share price value — since inception" : "Total NAV — since inception"}</p>
          <h2>Peak {formatChartValue(peak)} · now {formatChartValue(chartNow)}</h2>
        </div>
        <div className="nsHistoryControls">
          <button className="nsReportButton" type="button" onClick={() => setExpanded(true)}>Expand</button>
          <div className="nsRangeTabs" aria-label="Chart value mode">
            {[
              ["performance", "Performance"],
              ["nav", "NAV"],
              ["shares", "Shares"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={mode === key ? "isActive" : ""}
                type="button"
                aria-pressed={mode === key}
                onClick={() => {
                  setMode(key as ChartValueMode);
                  setHoverIndex(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="nsRangeTabs" aria-label="Chart range">
          {[
            ["all", "All"],
            ["6m", "6M"],
            ["3m", "3M"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={range === key ? "isActive" : ""}
              type="button"
              aria-pressed={range === key}
              onClick={() => {
                setRange(key as "all" | "6m" | "3m");
                setHoverIndex(null);
              }}
            >
              {label}
            </button>
          ))}
          </div>
        </div>
      </div>
      <div
        className="nsHistoryChartButton"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={openOnKeyboard}
        aria-label={`Open detailed ${title} chart`}
      >
        <div className="nsHistoryChartWrap">
          {chartSvg("nsHistoryFill", "Portfolio history chart")}
          {renderTooltip()}
        </div>
      </div>
      <div className="nsChartMonths" aria-hidden="true">
        {monthLabels.length ? monthLabels.map((point) => <span key={`${point.label}-${point.x}`}>{fmtChartLabel(point.label).split(" ")[0]}</span>) : <span>Now</span>}
      </div>
      {expanded ? (
        <ChartOverlay title={title} onClose={() => setExpanded(false)}>
          <NavDetailPanel performance={performance} scope={scope} mode={mode} />
        </ChartOverlay>
      ) : null}
    </div>
  );
}

function ChartOverlay({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="nsChartOverlay" role="dialog" aria-modal="true" aria-label={title}>
      <button className="nsChartOverlayScrim" type="button" aria-label="Close chart" onClick={onClose} />
      <section className="nsChartOverlayPanel">
        <div className="nsChartOverlayHeader">
          <div>
            <p className="nsEyebrow">Detailed chart</p>
            <h2>{title}</h2>
          </div>
          <button className="nsReportButton" type="button" onClick={onClose}>Close</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function PeriodReturnStrip({ returns }: { returns: PeriodReturnSummary[] }) {
  if (!returns.length) return null;
  return (
    <section className="nsReturnStrip" aria-label="Return analytics">
      {returns.map((item) => {
        const hasValue = item.valueAud != null && item.valuePercent != null;
        const positive = (item.valueAud ?? 0) >= 0;
        return (
          <article key={item.key} className="nsReturnItem">
            <span>{item.label}</span>
            <strong className={hasValue ? positive ? "isPositive" : "isNegative" : undefined}>{fmtSignedPct(item.valuePercent)}</strong>
            <em className={hasValue ? positive ? "isPositive" : "isNegative" : undefined}>{hasValue ? `${fmtSignedAud(item.valueAud ?? 0)} NAV` : item.note}</em>
          </article>
        );
      })}
    </section>
  );
}

function MetalsPricePanel() {
  const [quotes, setQuotes] = useState<MetalQuote[]>(metalQuoteShells);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadMetals() {
      try {
        const response = await fetch("/api/prices/metals", { cache: "no-store" });
        const payload = await response.json() as { quotes?: MetalSpotApiQuote[]; errors?: string[] };
        const byMetal = new Map((payload.quotes ?? []).map((quote) => [quote.metal, quote]));
        const nextQuotes = metalQuoteShells.map((shell) => {
          const quote = byMetal.get(shell.metal);
          return quote ? {
            ...shell,
            label: quote.label,
            value: quote.price,
            priceDate: quote.priceDate,
            source: quote.source.replace(" spot mid", ""),
          } : { ...shell, source: "No spot quote" };
        });
        if (!cancelled) {
          setQuotes(nextQuotes);
          setError((payload.errors ?? []).join("; "));
        }
      } catch (reason) {
        if (!cancelled) {
          setQuotes(metalQuoteShells.map((quote) => ({ ...quote, source: "No spot quote" })));
          setError(reason instanceof Error ? reason.message : "Unable to load metals spot prices.");
        }
      }
    }
    void loadMetals();
    return () => {
      cancelled = true;
    };
  }, []);

  const gold = quotes.find((quote) => quote.metal === "gold");
  const silver = quotes.find((quote) => quote.metal === "silver");
  const gsr = gold?.value && silver?.value ? gold.value / silver.value : null;

  return (
    <section className="nsMetalsPanel" aria-label="Metals prices">
      <div className="nsMetalsHeader">
        <p className="nsEyebrow">Metals prices</p>
        <strong>Gold is a numeraire/hurdle here, not a configured holding unless gold appears in allocations.</strong>
      </div>
      <div className="nsMetalsGrid">
        {quotes.map((quote) => (
          <a key={quote.label} className="nsMetalTile" style={{ borderColor: `${quote.color}42` }} href={tradingViewChartUrl(quote.tradingViewSymbol)} target="_blank" rel="noreferrer" aria-label={`Open ${quote.label} on TradingView`}>
            <span>
              <i style={{ background: quote.color }} />{quote.label}
              <b aria-hidden="true">TV</b>
            </span>
            <strong>{fmtMetalPrice(quote)}</strong>
            <em>{quote.value == null ? quote.source : `${quote.source} · ${fmtDate(quote.priceDate)}`}</em>
          </a>
        ))}
        <a className="nsMetalTile nsMetalRatio" href={tradingViewChartUrl("TVC:GOLDSILVER")} target="_blank" rel="noreferrer" aria-label="Open GSR on TradingView">
          <span>
            <i />GSR
            <b aria-hidden="true">TV</b>
          </span>
          <strong>{gsr == null ? "n/a" : gsr.toFixed(1)}</strong>
          <em>{gsr == null ? "Needs gold + silver spot" : "Gold numeraire ratio"}</em>
        </a>
      </div>
      {error ? <p className="nsMetalsError">{error}</p> : null}
    </section>
  );
}

function OverviewStockChartPanel({ holding }: { holding: Holding }) {
  const [expanded, setExpanded] = useState(false);
  const tvSymbol = tradingViewSymbolForInstrument(holding);
  return (
    <section className="stockChartPanel nsStockChartPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Stock chart</p>
          <h3 className="cardTitle">{holding.symbol} · {holding.name}</h3>
          <p className="cardIntro">{tvSymbol} · {holding.exchange ?? "Market"} · {holding.priceCurrency ?? "Local"}</p>
        </div>
        <div className="nsStockChartActions">
          <button className="button" type="button" onClick={() => setExpanded(true)}>Expand</button>
          <a className="button" href={tradingViewChartUrl(tvSymbol)} target="_blank" rel="noreferrer">Open in TradingView</a>
        </div>
      </div>
      <TradingViewWidget symbol={tvSymbol} minHeight={320} maxHeight={420} compactMinHeight={300} compactMaxHeight={380} heightRatio={0.48} compactHeightRatio={0.5} />
      {expanded ? (
        <ChartOverlay title={`${holding.symbol} · ${holding.name}`} onClose={() => setExpanded(false)}>
          <p className="cardIntro">{tvSymbol} · expanded embedded chart</p>
          <TradingViewWidget
            symbol={tvSymbol}
            minHeight={620}
            maxHeight={780}
            compactMinHeight={460}
            compactMaxHeight={620}
            heightRatio={0.78}
            compactHeightRatio={0.68}
          />
        </ChartOverlay>
      ) : null}
    </section>
  );
}

function HoldingsTable({ holdings, total, scope, healthTone }: { holdings: Holding[]; total: number; scope: PortfolioScope; healthTone: HealthTone }) {
  const [showAllOverall, setShowAllOverall] = useState(false);
  const [chartHolding, setChartHolding] = useState<Holding | null>(null);
  const [showFxAudit, setShowFxAudit] = useState(false);
  const [sort, setSort] = useState<HoldingSortState>({ key: "value", direction: "desc" });
  const isOverall = scope === "overall";
  const sortedHoldings = useMemo(() => sortHoldings(holdings, sort, total), [holdings, sort, total]);
  const visibleHoldings = isOverall && !showAllOverall ? sortedHoldings.slice(0, 6) : sortedHoldings;
  const accountGroups = useMemo(() => holdingAccountGroups(visibleHoldings), [visibleHoldings]);
  const showAccountGroups = !isOverall && accountGroups.length > 1;
  const fxAuditHoldings = useMemo(() => foreignCurrencyAuditHoldings(holdings), [holdings]);
  const scopeLabel = scope === "smsf" ? "SMSF" : scope === "personal" ? "Personal" : "Overall";
  const sortButton = (key: HoldingSortKey, label: string) => (
    <button className={sort.key === key ? "isActive" : ""} type="button" onClick={() => setSort((current) => nextSort(current, key, overviewAscendingSorts))} aria-sort={sort.key === key ? (sort.direction === "desc" ? "descending" : "ascending") : "none"}>
      <span>{label}</span>
      <em>{sortIndicator(sort, key)}</em>
    </button>
  );

  useEffect(() => {
    if (chartHolding && !holdings.some((holding) => holding.id === chartHolding.id)) setChartHolding(null);
  }, [chartHolding, holdings]);

  const renderRows = (rows: Holding[]) => rows.map((holding) => {
    const dailyGain = holding.dayGainAud ?? 0;
    const dailyPercent = dayGainPercent(holding);
    return (
      <div
        className={`nsHoldingRow${chartHolding?.id === holding.id ? " isSelected" : ""}`}
        role="row"
        tabIndex={0}
        aria-selected={chartHolding?.id === holding.id}
        key={holding.id}
        onClick={() => setChartHolding(holding)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setChartHolding(holding);
          }
        }}
      >
        <div className="nsHoldingIdentity">
          <strong>{holding.symbol}</strong>
          <span>{holding.name}</span>
        </div>
        <div className="nsSectorWeightCell">
          <em style={{ background: `${SECTOR_COLORS[holding.sector]}30`, color: SECTOR_COLORS[holding.sector] }}>{sectorShortName(holding.sector)}</em>
          <strong>{fmtPct(pct(holding.marketValueAud, total))}</strong>
        </div>
        <div>
          <strong>{fmtLatestPrice(holding)}</strong>
          <span>{holding.priceAsOfDate ?? holding.exchange ?? "Latest stored close"}</span>
        </div>
        <div>
          <strong>{fmtAud(holding.marketValueAud)}</strong>
          <span>{fmtPct(pct(holding.marketValueAud, total))} of NAV</span>
        </div>
        <div className={dailyGain >= 0 ? "isPositive" : "isNegative"}>
          <strong>{fmtSignedAud(dailyGain)}</strong>
          <span>{dailyPercent == null ? "n/a" : fmtSignedPct(dailyPercent)}</span>
        </div>
        <div className={holding.pnlAud >= 0 ? "isPositive" : "isNegative"}>
          <strong>{fmtSignedAud(holding.pnlAud)}</strong>
          <span>{fmtSignedPct(holding.pnlPercent)} position P/L</span>
        </div>
      </div>
    );
  });

  return (
    <section id="holdings" className="nsPanel nsPositionsPanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">{isOverall ? "Largest positions" : showAccountGroups ? `${scopeLabel} shares by account` : `All ${scopeLabel} shares`}</p>
          <h2>{isOverall ? "Allocation of shares" : showAccountGroups ? `${scopeLabel} account allocation` : `${scopeLabel} share allocation`}</h2>
        </div>
        <div className="nsPositionsActions">
          {fxAuditHoldings.length ? (
            <button className="nsPositionsToggle" type="button" onClick={() => setShowFxAudit((current) => !current)}>
              {showFxAudit ? "Hide FX audit" : "FX audit"}
            </button>
          ) : null}
          {isOverall && holdings.length > 6 ? (
            <button className="nsPositionsToggle" type="button" onClick={() => setShowAllOverall((current) => !current)}>
              {showAllOverall ? "Show fewer" : `Show all ${holdings.length} ->`}
            </button>
          ) : (
            <span className="nsPositionsCount"><span className={`nsStatusPip is-${healthTone}`} />All {holdings.length} shown</span>
          )}
        </div>
      </div>
      {chartHolding ? <OverviewStockChartPanel holding={chartHolding} /> : null}
      {showFxAudit ? (
        <section className="nsFxAuditPanel" aria-label="Foreign-currency P/L audit">
          <div>
            <p className="nsEyebrow">FX audit</p>
            <h3>Foreign-currency P/L basis</h3>
            <p>Position P/L is measured in AUD: current local price and current FX set market value, while historical AUD cost comes from each trade date FX rate when the IBKR feed provides it.</p>
          </div>
          <div className="nsFxAuditRows">
            {fxAuditHoldings.slice(0, 5).map((holding) => (
              <article key={holding.id}>
                <strong>{holding.symbol}</strong>
                <span>{holding.priceCurrency ?? "Local"} price · {fmtLatestPrice(holding)}</span>
                <em className={holding.pnlAud >= 0 ? "isPositive" : "isNegative"}>{fmtSignedAud(holding.pnlAud)} · {fmtSignedPct(holding.pnlPercent)}</em>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <p className="nsTableNote">Values and P/L are in AUD. Foreign holdings keep local price, trade-date AUD cost basis and current AUD market value separate.</p>
      <div className="nsHoldingsTable" role="table" aria-label={`${scopeLabel} share positions`}>
        <div className="nsHoldingsHeader" role="row">
          <span>{sortButton("holding", "Holding")}</span>
          <span>{sortButton("sector", "Sector · NAV weight")}</span>
          <span>{sortButton("price", "Latest price (local)")}</span>
          <span>{sortButton("value", "Value (AUD)")}</span>
          <span>{sortButton("day", "Day P/L")}</span>
          <span>{sortButton("pnl", "Position P/L")}</span>
        </div>
        {showAccountGroups ? accountGroups.map((group) => (
          <section className="nsHoldingsAccountGroup" key={group.key} aria-label={group.label}>
            <div className="nsHoldingsAccountHeader">
              <div>
                <strong>{group.label}</strong>
                <span>{group.detail}</span>
              </div>
              <em>{fmtAud(group.value)} · {fmtPct(pct(group.value, total))} of NAV</em>
            </div>
            {renderRows(group.holdings)}
          </section>
        )) : renderRows(visibleHoldings)}
        {!visibleHoldings.length ? <div className="nsHoldingEmpty">No share holdings in this view.</div> : null}
      </div>
    </section>
  );
}

function SectorDonut({ sectors, total }: { sectors: Array<{ sector: Sector; value: number }>; total: number }) {
  return (
    <section className="nsPanel nsSectorPanel">
      <p className="nsEyebrow">Sector distribution</p>
      <div className="nsDonutWrap">
        <div className="nsDonut" style={{ background: makeDonut(sectors, total) }}>
          <div><span>NAV</span><strong>{fmtShortAud(total)}</strong></div>
        </div>
      </div>
      <div className="nsSectorList">
        {sectors.map((sector) => (
          <div key={sector.sector}>
            <span><i style={{ background: SECTOR_COLORS[sector.sector] }} />{sector.sector}</span>
            <strong>{fmtAud(sector.value)} <em>{fmtPct(pct(sector.value, total))}</em></strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function CurrencyExposurePanel({ exposures }: { exposures: CurrencyExposureSummary[] }) {
  if (!exposures.length) return null;
  const max = Math.max(...exposures.map((item) => item.valuePercent), 1);
  return (
    <section className="nsPanel nsExposurePanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">Currency exposure</p>
          <h2>Market value by currency</h2>
        </div>
      </div>
      <div className="nsExposureRows">
        {exposures.map((item) => (
          <div key={item.currency} className="nsExposureRow">
            <div>
              <strong>{item.currency}</strong>
              <span>{item.positionCount} instruments{item.cashValueAud > 0 ? " + cash" : ""}</span>
            </div>
            <span className="nsExposureBar"><i style={{ width: `${Math.max(3, (item.valuePercent / max) * 100)}%` }} /></span>
            <strong>{fmtAud(item.amountAud)} <em>{fmtPct(item.valuePercent)}</em></strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function AllocationDriftPanel({ drift }: { drift: AllocationDriftSummary[] }) {
  if (!drift.length) return null;
  return (
    <section className="nsPanel nsDriftPanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">Allocation drift</p>
          <h2>Current vs draft target</h2>
        </div>
      </div>
      <div className="nsDriftRows">
        {drift.slice(0, 6).map((item) => {
          const underTarget = item.valueToTarget > 0;
          return (
            <article key={item.sector} className="nsDriftRow">
              <div>
                <strong>{item.sector}</strong>
                <span>{fmtPct(item.currentPercent)} now · {fmtPct(item.targetPercent)} target</span>
              </div>
              <div className="nsDriftBars" aria-hidden="true">
                <span><i style={{ width: `${Math.min(100, Math.max(0, item.currentPercent))}%`, background: item.color }} /></span>
                <span><i style={{ width: `${Math.min(100, Math.max(0, item.targetPercent))}%` }} /></span>
              </div>
              <strong className={underTarget ? "isUnder" : "isOver"}>
                {underTarget ? "Add" : "Trim"} {fmtAud(Math.abs(item.valueToTarget))}
                <em>{item.driftPercent >= 0 ? "+" : ""}{item.driftPercent.toFixed(1)} pts</em>
              </strong>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CommodityExposurePanel({ exposures, total }: { exposures: CommodityExposureSummary[]; total: number }) {
  if (!exposures.length) return null;
  const max = Math.max(...exposures.map((item) => item.value), 1);
  return (
    <section className="nsPanel nsExposurePanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">Commodity exposure</p>
          <h2>Economic exposure</h2>
        </div>
      </div>
      <div className="nsExposureRows">
        {exposures.map((item) => (
          <div key={item.name} className="nsExposureRow">
            <div>
              <strong>{item.name}</strong>
              <span>{item.positionCount} positions</span>
            </div>
            <span className="nsExposureBar"><i style={{ width: `${Math.max(3, (item.value / max) * 100)}%`, background: item.color }} /></span>
            <strong>{fmtAud(item.value)} <em>{fmtPct(pct(item.value, total))}</em></strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function IncomeFrankingPanel({ income }: { income?: IncomeSummary }) {
  if (!income) return null;
  return (
    <section className="nsPanel nsIncomePanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">Income / franking</p>
          <h2>Trailing 12-month income</h2>
        </div>
      </div>
      <div className="nsIncomeSummary">
        <div>
          <span>Net income</span>
          <strong>{fmtAud(income.netCashAud)}</strong>
        </div>
        <div>
          <span>Franking credits</span>
          <strong>{fmtAud(income.frankingCreditsAud)}</strong>
        </div>
        <div>
          <span>Gross-up yield</span>
          <strong>{income.grossedUpYieldPercent == null ? "n/a" : fmtPct(income.grossedUpYieldPercent)}</strong>
        </div>
        <div>
          <span>Tax withheld</span>
          <strong>{fmtAud(income.taxWithheldAud)}</strong>
        </div>
      </div>
      <div className="nsIncomeRows">
        {income.symbols.length ? income.symbols.map((item) => (
          <article key={item.symbol} className="nsIncomeRow">
            <div>
              <strong>{item.symbol}</strong>
              <span>{item.payments} payment{item.payments === 1 ? "" : "s"}</span>
            </div>
            <span>{fmtAud(item.netCashAud)} net</span>
            <em>{item.frankingCreditsAud ? `${fmtAud(item.frankingCreditsAud)} franking` : `${fmtAud(item.taxWithheldAud)} withheld`}</em>
          </article>
        )) : (
          <p className="nsIncomeEmpty">{income.note}</p>
        )}
      </div>
      <p className="nsIncomeNote">{fmtChartLabel(income.periodStart)} to {fmtChartLabel(income.periodEnd)} · {income.dividendCount} payment{income.dividendCount === 1 ? "" : "s"}</p>
    </section>
  );
}

/** Full redesigned overview dashboard matching the screenshot reference. */
export function OverviewScreen({ holdings, logoSrc, performance = [], periodReturnsByScope, incomeByScope, currencyExposureByScope, allocationTargets = [], accountBreakdown = [], syncRuns = [], freshnessByScope, lastUpdatedByScope, onRefresh }: {
  holdings: Holding[];
  logoSrc?: string;
  performance?: PerformancePoint[];
  periodReturnsByScope?: Partial<Record<PortfolioScope, PeriodReturnSummary[]>>;
  incomeByScope?: Partial<Record<PortfolioScope, IncomeSummary>>;
  currencyExposureByScope?: Partial<Record<PortfolioScope, CurrencyExposureSummary[]>>;
  allocationTargets?: AllocationTarget[];
  accountBreakdown?: AccountBreakdownSummary[];
  syncRuns?: SyncRunSummary[];
  freshnessByScope?: Partial<Record<PortfolioScope, ValuationFreshnessSummary[]>>;
  lastUpdatedByScope?: Partial<Record<PortfolioScope, string | null>>;
  onRefresh?: () => Promise<void> | void;
}) {
  const [scope, setScope] = useState<PortfolioScope>("overall");
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncMessageTone, setSyncMessageTone] = useState<"good" | "warning" | "bad">("good");
  const view = byScope(holdings, scope);
  const t = totals(view);
  const dailyPnl = view.reduce((sum, holding) => sum + (holding.dayGainAud ?? 0), 0);
  const sectors = bySector(view);
  const shareHoldings = useMemo(
    () => view.filter(isShareLike).sort((a, b) => b.marketValueAud - a.marketValueAud),
    [view],
  );
  const freshness = freshnessByScope?.[scope] ?? freshnessByScope?.overall ?? [];
  const selectedUpdatedAt = lastUpdatedByScope?.[scope] ?? lastUpdatedByScope?.overall ?? null;
  const health = dataHealth(syncRuns, freshness);
  const cashForScope = scope === "overall"
    ? accountBreakdown.reduce((sum, account) => sum + account.cashValue, 0)
    : accountBreakdown.find((account) => account.scope === scope)?.cashValue ?? 0;
  const investedNow = Math.max(0, t.marketValue - cashForScope);
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  };
  const syncEverything = async () => {
    setSyncingAll(true);
    setSyncMessage("Sync running...");
    setSyncMessageTone("warning");
    try {
      const response = await fetch("/api/sync/all", { method: "POST" });
      const payload = await response.json();
      const errors = Array.isArray(payload.errors) ? payload.errors.filter(Boolean) : [];
      if (!response.ok && !errors.length) throw new Error(payload.error || "Sync failed.");
      if (errors.length) {
        setSyncMessage(`Sync finished with ${errors.length} issue${errors.length === 1 ? "" : "s"}.`);
        setSyncMessageTone("warning");
      } else {
        setSyncMessage("Sync complete.");
        setSyncMessageTone("good");
      }
      await onRefresh?.();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Sync failed.");
      setSyncMessageTone("bad");
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <main className="nsScreenMain nsOverview">
        <header className="nsOverviewHeader">
          <div>
            <h1>State of play</h1>
            <p>Where the portfolio is right now. Nominal AUD and gold-relative wealth, allocation and holdings — no ratios, RSI or chart stacks on this screen.</p>
          </div>
          <div className="nsHeaderControls">
            <ScopeTabs value={scope} onChange={setScope} />
            <p><span className={`nsStatusPip is-${health.tone}`} />{health.label} · Valuations · {fmtLongDate(selectedUpdatedAt)}</p>
            {syncMessage ? <p><span className={`nsStatusPip is-${syncMessageTone}`} />{syncMessage}</p> : null}
            <div className="nsReportLinks">
              <button className="nsReportButton" type="button" onClick={() => void syncEverything()} disabled={syncingAll}>
                {syncingAll ? "Syncing..." : "Sync everything"}
              </button>
              <a className="nsReportLink" href={`/api/reports/wealth-statement?scope=${scope}`}>Wealth CSV</a>
              <a className="nsReportLink" href="/api/reports/estate-summary">Estate CSV</a>
              <button className="nsReportButton" type="button" onClick={() => void signOut()}>Sign out</button>
            </div>
          </div>
        </header>

        <StateOfPlayCards total={t} dailyPnl={dailyPnl} accounts={accountBreakdown} holdings={holdings} scope={scope} />

        <div className="nsStateChartGrid">
          <HistoryChart now={t.marketValue} investedNow={investedNow} scope={scope} performance={performance} />
          <SectorDonut sectors={sectors} total={t.marketValue} />
        </div>

        <HoldingsTable holdings={shareHoldings} total={t.marketValue} scope={scope} healthTone={health.tone} />

    </main>
  );
}
