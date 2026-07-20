"use client";

import React, { useMemo, useState } from "react";
import { NavRail } from "./NavRail";
import { allocationDriftForSectors, type AllocationDriftSummary, type AllocationTarget } from "../lib/allocation-drift";
import { dataHealth, type HealthTone } from "../lib/data-health";
import { byComposition, byScope, bySector, fmtAud, totals } from "../lib/portfolio-metrics";
import { COMPOSITION_OF, SECTOR_COLORS, type CompositionGroup, type Holding, type PortfolioScope, type Sector } from "../types";

type PerformancePoint = { date: string; overall?: number; personal?: number; smsf?: number };
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
type XirrSummary = {
  valuePercent: number | null;
  startDate: string | null;
  endDate: string | null;
  cashFlowCount: number;
  fallbackPositionCount: number;
  terminalValue: number;
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
type AccountBreakdownSummary = {
  scope: "personal" | "smsf";
  label: string;
  netAssetValue: number;
  investedValue: number;
  cashValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  positionCount: number;
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

const scopeOptions: PortfolioScope[] = ["overall", "personal", "smsf"];
const groupLabel: Record<CompositionGroup, string> = {
  miners: "Miners",
  metals: "Metals & bullion",
  other: "Oil & cash",
};
const groupColor: Record<CompositionGroup, string> = {
  miners: "#d7b56d",
  metals: "#9fb4ca",
  other: "#647587",
};
const commodityBySector: Record<Sector, { name: string; color: string }> = {
  "Silver miners": { name: "Silver", color: "#b9c4d0" },
  "Silver bullion": { name: "Silver", color: "#e3e9f0" },
  "Gold miners": { name: "Gold", color: "#d7b56d" },
  "Uranium miners": { name: "Uranium", color: "#8dc6a0" },
  "Uranium explorers": { name: "Uranium", color: "#5fbf8f" },
  Technology: { name: "Technology", color: "#77a9d8" },
  "Platinum bullion": { name: "Platinum", color: "#8fa6bf" },
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

type MetalQuote = {
  label: "Gold" | "Silver" | "Platinum";
  value: number | null;
  currency: string;
  unit: string;
  source: string;
  asOfDate: string | null;
  spotCompatible: boolean;
  color: string;
};

const physicalGoldSymbols = new Set(["GOLD", "PMGOLD", "QAU", "GLD", "IAU", "AAAU", "SGOL", "PHAU", "SGLD", "XAU"]);

function metalUnitPrice(holding: Holding) {
  if (holding.lastPrice != null && Number.isFinite(holding.lastPrice)) return holding.lastPrice;
  return holding.units ? holding.marketValueAud / holding.units : null;
}

function metalQuoteFromHolding(holding: Holding | undefined, meta: Omit<MetalQuote, "value" | "currency" | "source" | "asOfDate">): MetalQuote {
  return {
    ...meta,
    value: holding ? metalUnitPrice(holding) : null,
    currency: holding?.priceCurrency ?? "AUD",
    source: holding?.symbol ?? "No feed",
    asOfDate: holding?.priceAsOfDate ?? null,
  };
}

function metalQuotesFor(holdings: Holding[]) {
  const largestByValue = (matches: (holding: Holding) => boolean) =>
    holdings.filter(matches).sort((a, b) => b.marketValueAud - a.marketValueAud)[0];
  const gold = largestByValue((holding) => physicalGoldSymbols.has(holding.symbol.toUpperCase()));
  const silver = largestByValue((holding) => holding.symbol.toUpperCase() === "ETPMAG" || holding.sector === "Silver bullion");
  const platinum = largestByValue((holding) => holding.sector === "Platinum bullion");
  const goldSymbol = gold?.symbol.toUpperCase() ?? "";
  const silverSymbol = silver?.symbol.toUpperCase() ?? "";
  return [
    metalQuoteFromHolding(gold, { label: "Gold", unit: "unit", spotCompatible: goldSymbol === "XAU" || goldSymbol === "XAUUSD", color: SECTOR_COLORS["Gold miners"] }),
    metalQuoteFromHolding(silver, { label: "Silver", unit: "unit", spotCompatible: silverSymbol === "XAG" || silverSymbol === "XAGUSD", color: SECTOR_COLORS["Silver bullion"] }),
    metalQuoteFromHolding(platinum, { label: "Platinum", unit: "kg", spotCompatible: false, color: SECTOR_COLORS["Platinum bullion"] }),
  ];
}

function fmtMetalPrice(quote: MetalQuote) {
  if (quote.value == null) return "n/a";
  const digits = quote.value >= 100 ? 2 : 3;
  return `${quote.currency} ${quote.value.toLocaleString("en-AU", { minimumFractionDigits: digits, maximumFractionDigits: digits })}/${quote.unit}`;
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

function valueForScope(point: PerformancePoint, scope: PortfolioScope) {
  if (scope === "personal") return point.personal;
  if (scope === "smsf") return point.smsf;
  return point.overall ?? ((point.personal ?? 0) + (point.smsf ?? 0) || undefined);
}

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

function sectorShortName(sector: Sector) {
  return sector.replace(" miners", "").replace(" bullion", "");
}

function isShareLike(holding: Holding) {
  return !["Cash", "Platinum bullion", "Rhodium metal", "Silver bullion"].includes(holding.sector);
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

function ScopeTabs({ value, onChange }: { value: PortfolioScope; onChange: (scope: PortfolioScope) => void }) {
  return (
    <div className="nsScopeTabs" aria-label="Portfolio scope">
      {scopeOptions.map((scope) => (
        <button key={scope} type="button" className={scope === value ? "isActive" : ""} onClick={() => onChange(scope)}>
          {scope === "smsf" ? "SMSF" : scope[0].toUpperCase() + scope.slice(1)}
        </button>
      ))}
    </div>
  );
}

function SplitLegend({ segments, total }: {
  segments: Array<{ key: string; label: string; value: number; color: string }>;
  total: number;
}) {
  return (
    <div className="nsSplitLegend">
      {segments.map((segment) => (
        <div key={segment.key}>
          <span style={{ background: segment.color }} />
          {segment.label} <strong>{fmtAud(segment.value)}</strong> <em>{fmtPct(pct(segment.value, total))}</em>
        </div>
      ))}
    </div>
  );
}

function SplitBar({ segments, total }: {
  segments: Array<{ key: string; value: number; color: string }>;
  total: number;
}) {
  return (
    <div className="nsHeroSplitBar" aria-hidden="true">
      {segments.map((segment) => (
        <span key={segment.key} style={{ width: `${pct(segment.value, total)}%`, background: segment.color }} />
      ))}
    </div>
  );
}

function HistoryChart({ now, scope, performance }: { now: number; scope: PortfolioScope; performance: PerformancePoint[] }) {
  const [range, setRange] = useState<"all" | "6m" | "3m">("all");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 528;
  const baseline = 160;
  const fullSeries = useMemo(
    () => performance
      .map((point) => ({ label: point.date, value: valueForScope(point, scope) }))
      .filter((point): point is { label: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value) && point.value > 0),
    [performance, scope],
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
  const values = series.length ? series.map((point) => point.value) : [now];
  const peak = Math.max(now, ...values);
  const floor = Math.min(...values, now);
  const valueRange = Math.max(1, peak - floor);
  const points = (series.length >= 2 ? series : [{ label: "Now", value: now }, { label: "Now", value: now }]).map((point, index, all) => {
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

  return (
    <div className="nsHistoryPanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">Total NAV — since inception</p>
          <h2>Peak {fmtShortAud(peak)} · now {fmtShortAud(now)}</h2>
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
      <div className="nsHistoryChartWrap">
        <svg
          className="nsHistoryChart"
          width={width}
          height={172}
          viewBox="0 0 528 172"
          role="img"
          aria-label="Portfolio history chart"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="nsHistoryFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#d7b56d" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#d7b56d" stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridValues.map((value, index) => {
            const y = 132 - ((value - floor) / valueRange) * 112;
            return (
              <g key={`${value}-${index}`}>
                <line className="nsChartGridLine" x1="0" x2={width} y1={y} y2={y} />
                <text className="nsChartAxisLabel" x={width - 4} y={Math.max(10, y - 5)} textAnchor="end">{fmtShortAud(value)}</text>
              </g>
            );
          })}
          <polygon points={fill} fill="url(#nsHistoryFill)" />
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
        {active ? (
          <div
            className={`nsChartTooltip ${active.x > width * 0.66 ? "isLeft" : ""}`}
            style={{ left: `${(active.x / width) * 100}%`, top: `${Math.max(8, Math.min(72, (active.y / 172) * 100))}%` }}
          >
            <span>{fmtChartLabel(active.label)}</span>
            <strong>{fmtAud(active.value)}</strong>
          </div>
        ) : null}
      </div>
      <div className="nsChartMonths" aria-hidden="true">
        {monthLabels.length ? monthLabels.map((point, index) => <span key={`${point.label}-${index}`}>{fmtChartLabel(point.label).replace(/ 20\d{2}$/, "")}</span>) : <span>Now</span>}
      </div>
    </div>
  );
}

function PeriodReturnStrip({ returns, xirr }: { returns: PeriodReturnSummary[]; xirr?: XirrSummary }) {
  if (!returns.length && !xirr) return null;
  return (
    <section className="nsReturnStrip" aria-label="Return analytics">
      {returns.map((item) => {
        const hasValue = item.valueAud != null && item.valuePercent != null;
        const positive = (item.valueAud ?? 0) >= 0;
        return (
          <article key={item.key} className="nsReturnItem">
            <span>{item.label}</span>
            <strong className={hasValue ? positive ? "isPositive" : "isNegative" : undefined}>{fmtSignedPct(item.valuePercent)}</strong>
            <em>{hasValue ? `${fmtSignedAud(item.valueAud ?? 0)} NAV` : item.note}</em>
          </article>
        );
      })}
      {xirr ? (
        <article className="nsReturnItem">
          <span>Cash-flow XIRR</span>
          <strong className={xirr.valuePercent == null ? undefined : xirr.valuePercent >= 0 ? "isPositive" : "isNegative"}>{fmtSignedPct(xirr.valuePercent)}</strong>
          <em>{xirr.valuePercent == null ? xirr.note : `${xirr.cashFlowCount} flows · ${xirr.note}`}</em>
        </article>
      ) : null}
    </section>
  );
}

function MetalsPricePanel({ holdings }: { holdings: Holding[] }) {
  const quotes = metalQuotesFor(holdings);
  const gold = quotes.find((quote) => quote.label === "Gold");
  const silver = quotes.find((quote) => quote.label === "Silver");
  const gsr = gold?.value && silver?.value && gold.spotCompatible && silver.spotCompatible ? gold.value / silver.value : null;

  return (
    <section className="nsMetalsPanel" aria-label="Metals prices">
      <div className="nsMetalsHeader">
        <p className="nsEyebrow">Metals prices</p>
        <strong>Gold · Silver · Platinum · GSR</strong>
      </div>
      <div className="nsMetalsGrid">
        {quotes.map((quote) => (
          <article key={quote.label} className="nsMetalTile" style={{ borderColor: `${quote.color}42` }}>
            <span><i style={{ background: quote.color }} />{quote.label}</span>
            <strong>{fmtMetalPrice(quote)}</strong>
            <em>{quote.value == null ? "No stored quote" : `${quote.source} · ${fmtDate(quote.asOfDate)}`}</em>
          </article>
        ))}
        <article className="nsMetalTile nsMetalRatio">
          <span><i />GSR</span>
          <strong>{gsr == null ? "n/a" : gsr.toFixed(1)}</strong>
          <em>{gsr == null ? "Needs gold + silver spot" : "Gold / silver"}</em>
        </article>
      </div>
    </section>
  );
}

function MetricCard({ label, value, note, tone }: { label: string; value: React.ReactNode; note: React.ReactNode; tone?: "positive" }) {
  return (
    <section className="nsMetricCard">
      <p className="nsEyebrow">{label}</p>
      <strong className={tone === "positive" ? "isPositive" : undefined}>{value}</strong>
      <span>{note}</span>
    </section>
  );
}

function HoldingsTable({ holdings, total, scope, healthTone }: { holdings: Holding[]; total: number; scope: PortfolioScope; healthTone: HealthTone }) {
  const [showAllOverall, setShowAllOverall] = useState(false);
  const isOverall = scope === "overall";
  const visibleHoldings = isOverall && !showAllOverall ? holdings.slice(0, 6) : holdings;
  const scopeLabel = scope === "smsf" ? "SMSF" : scope === "personal" ? "Personal" : "Overall";
  return (
    <section id="holdings" className="nsPanel nsPositionsPanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">{isOverall ? "Largest positions" : `All ${scopeLabel} shares`}</p>
          <h2>{isOverall ? "Allocation of shares" : `${scopeLabel} share allocation`}</h2>
        </div>
        {isOverall && holdings.length > 6 ? (
          <button className="nsPositionsToggle" type="button" onClick={() => setShowAllOverall((current) => !current)}>
            {showAllOverall ? "Show top 6" : `Show all ${holdings.length} ->`}
          </button>
        ) : (
          <span className="nsPositionsCount"><span className={`nsStatusPip is-${healthTone}`} />All {holdings.length} shown</span>
        )}
      </div>
      <div className="nsHoldingsTable" role="table" aria-label={`${scopeLabel} share positions`}>
        <div className="nsHoldingsHeader" role="row">
          <span>Holding</span>
          <span>Sector · NAV weight</span>
          <span>Latest price</span>
          <span>Value</span>
          <span>Day P/L</span>
          <span>Position P/L</span>
        </div>
        {visibleHoldings.map((holding) => {
          const dailyGain = holding.dayGainAud ?? 0;
          const dailyPercent = dayGainPercent(holding);
          return (
            <div className="nsHoldingRow" role="row" key={holding.id}>
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
        })}
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

function AccountBreakdownPanel({ accounts, scope, xirrByScope }: { accounts: AccountBreakdownSummary[]; scope: PortfolioScope; xirrByScope?: Partial<Record<PortfolioScope, XirrSummary>> }) {
  const visibleAccounts = scope === "overall" ? accounts : accounts.filter((account) => account.scope === scope);
  if (!visibleAccounts.length) return null;
  return (
    <section className="nsPanel nsAccountPanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">Account breakdown</p>
          <h2>Legal books and cash</h2>
        </div>
      </div>
      <div className="nsAccountItems">
        {visibleAccounts.map((account) => {
          const accountXirr = xirrByScope?.[account.scope]?.valuePercent ?? null;
          return (
            <article key={account.scope} className="nsAccountItem">
              <div>
                <span>{account.label}</span>
                <strong>{fmtAud(account.netAssetValue)}</strong>
              <em>{fmtPct(account.shareOfOverall)} of total NAV</em>
            </div>
            <dl>
              <div><dt>XIRR</dt><dd className={accountXirr == null ? undefined : accountXirr >= 0 ? "isPositive" : "isNegative"}>{fmtSignedPct(accountXirr)}</dd></div>
              <div><dt>P/L</dt><dd className={account.totalReturn >= 0 ? "isPositive" : "isNegative"}>{fmtSignedAud(account.totalReturn)} · {account.totalReturnPercent >= 0 ? "+" : ""}{account.totalReturnPercent.toFixed(1)}%</dd></div>
              <div><dt>Invested</dt><dd>{fmtAud(account.investedValue)}</dd></div>
              <div><dt>Cash</dt><dd>{fmtAud(account.cashValue)}</dd></div>
                <div><dt>Positions</dt><dd>{account.positionCount}</dd></div>
                <div><dt>Updated</dt><dd>{fmtDate(account.lastUpdated)}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Full redesigned overview dashboard matching the screenshot reference. */
export function OverviewScreen({ holdings, logoSrc, performance = [], periodReturnsByScope, xirrByScope, incomeByScope, currencyExposureByScope, allocationTargets = [], accountBreakdown = [], syncRuns = [], freshnessByScope, lastUpdatedByScope }: {
  holdings: Holding[];
  logoSrc?: string;
  performance?: PerformancePoint[];
  periodReturnsByScope?: Partial<Record<PortfolioScope, PeriodReturnSummary[]>>;
  xirrByScope?: Partial<Record<PortfolioScope, XirrSummary>>;
  incomeByScope?: Partial<Record<PortfolioScope, IncomeSummary>>;
  currencyExposureByScope?: Partial<Record<PortfolioScope, CurrencyExposureSummary[]>>;
  allocationTargets?: AllocationTarget[];
  accountBreakdown?: AccountBreakdownSummary[];
  syncRuns?: SyncRunSummary[];
  freshnessByScope?: Partial<Record<PortfolioScope, ValuationFreshnessSummary[]>>;
  lastUpdatedByScope?: Partial<Record<PortfolioScope, string | null>>;
}) {
  const [scope, setScope] = useState<PortfolioScope>("overall");
  const view = byScope(holdings, scope);
  const t = totals(view);
  const dailyPnl = view.reduce((sum, holding) => sum + (holding.dayGainAud ?? 0), 0);
  const comp = byComposition(view);
  const sectors = bySector(view);
  const shareHoldings = useMemo(
    () => view.filter(isShareLike).sort((a, b) => b.marketValueAud - a.marketValueAud),
    [view],
  );
  const commodityExposure = useMemo(() => commodityExposureFor(view), [view]);
  const allocationDrift = useMemo(() => allocationDriftForSectors(sectors, t.marketValue, allocationTargets), [sectors, t.marketValue, allocationTargets]);
  const largestSector = sectors[0];
  const bestPerformer = shareHoldings.reduce<Holding | undefined>(
    (best, holding) => (!best || holding.pnlPercent > best.pnlPercent ? holding : best),
    undefined,
  );
  const groupSegments = (["miners", "metals", "other"] as CompositionGroup[]).map((group) => ({
    key: group,
    label: groupLabel[group],
    value: comp[group],
    color: groupColor[group],
  }));
  const freshness = freshnessByScope?.[scope] ?? freshnessByScope?.overall ?? [];
  const periodReturns = periodReturnsByScope?.[scope] ?? periodReturnsByScope?.overall ?? [];
  const xirr = xirrByScope?.[scope] ?? xirrByScope?.overall;
  const income = incomeByScope?.[scope] ?? incomeByScope?.overall;
  const currencyExposure = currencyExposureByScope?.[scope] ?? currencyExposureByScope?.overall ?? [];
  const selectedUpdatedAt = lastUpdatedByScope?.[scope] ?? lastUpdatedByScope?.overall ?? null;
  const health = dataHealth(syncRuns, freshness);
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  };

  return (
    <div className="nsScreen">
      <NavRail active="overview" logoSrc={logoSrc} />
      <main className="nsScreenMain nsOverview">
        <header className="nsOverviewHeader">
          <div>
            <h1>Good morning, Stephen</h1>
            <p>Live portfolio — stocks, bullion &amp; cash</p>
          </div>
          <div className="nsHeaderControls">
            <ScopeTabs value={scope} onChange={setScope} />
            <p><span className={`nsStatusPip is-${health.tone}`} />{health.label} · Valuations · {fmtLongDate(selectedUpdatedAt)}</p>
            <div className="nsReportLinks">
              <a className="nsReportLink" href={`/api/reports/wealth-statement?scope=${scope}`}>Wealth CSV</a>
              <a className="nsReportLink" href="/api/reports/estate-summary">Estate CSV</a>
              <button className="nsReportButton" type="button" onClick={() => void signOut()}>Sign out</button>
            </div>
          </div>
        </header>

        <section className="nsHeroPanel">
          <div className="nsHeroSummary">
            <p className="nsEyebrow">{scope === "overall" ? "Total net asset value" : scope === "smsf" ? "SMSF net asset value" : "Personal net asset value"}</p>
            <div className="nsHeroValue">{fmtAud(t.marketValue)}</div>
            <div className="nsHeroStats">
              <div><span>Daily P/L</span><strong className={dailyPnl >= 0 ? "isPositive" : "isNegative"}>{fmtSignedAud(dailyPnl)}</strong></div>
              <div><span>Profit / loss</span><strong className={t.pnl >= 0 ? "isPositive" : "isNegative"}>{fmtSignedAud(t.pnl)}</strong></div>
              <div><span>Return on cost</span><strong className={t.pnl >= 0 ? "isPositive" : "isNegative"}>{t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(1)}%</strong></div>
            </div>
            <SplitBar segments={groupSegments} total={t.marketValue} />
            <SplitLegend segments={groupSegments} total={t.marketValue} />
          </div>
          <div className="nsHeroChartStack">
            <HistoryChart now={t.marketValue} scope={scope} performance={performance} />
            <MetalsPricePanel holdings={view} />
          </div>
        </section>

        <section className="nsMetricGrid" aria-label="Portfolio summary cards">
          <MetricCard label="Profit / loss" value={fmtSignedAud(t.pnl)} note={`${t.pnlPercent >= 0 ? "+" : ""}${t.pnlPercent.toFixed(1)}% on cost`} tone={t.pnl >= 0 ? "positive" : undefined} />
          <MetricCard label="Positions" value={t.count} note="stocks, ETFs & bullion" />
          <MetricCard label="Largest sector" value={largestSector?.sector ?? "No sector"} note={largestSector ? `${fmtPct(pct(largestSector.value, t.marketValue))} · ${fmtAud(largestSector.value)}` : "No holdings yet"} />
          <MetricCard label="Best performer" value={bestPerformer?.name.replace(" Metals", "") ?? "No performer"} note={bestPerformer ? `${bestPerformer.pnlPercent >= 0 ? "+" : ""}${bestPerformer.pnlPercent.toFixed(1)}% · ${bestPerformer.symbol}` : "No holdings yet"} />
        </section>

        <PeriodReturnStrip returns={periodReturns} xirr={xirr} />

        <AccountBreakdownPanel accounts={accountBreakdown} scope={scope} xirrByScope={xirrByScope} />

        <div className="nsLowerGrid">
          <HoldingsTable holdings={shareHoldings} total={t.marketValue} scope={scope} healthTone={health.tone} />
          <SectorDonut sectors={sectors} total={t.marketValue} />
        </div>

        <div className="nsAnalyticsGrid">
          <CommodityExposurePanel exposures={commodityExposure} total={t.marketValue} />
          <CurrencyExposurePanel exposures={currencyExposure} />
          <IncomeFrankingPanel income={income} />
          <AllocationDriftPanel drift={allocationDrift} />
        </div>
      </main>
    </div>
  );
}
