"use client";

import React, { useMemo, useState } from "react";
import { NavRail } from "./NavRail";
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
type CommodityExposureSummary = {
  name: string;
  value: number;
  positionCount: number;
  color: string;
};
type AllocationDriftSummary = {
  sector: Sector;
  currentValue: number;
  targetValue: number;
  currentPercent: number;
  targetPercent: number;
  driftPercent: number;
  valueToTarget: number;
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
  "Platinum bullion": { name: "Platinum", color: "#8fa6bf" },
  "Rhodium metal": { name: "Rhodium", color: "#c78db8" },
  Oil: { name: "Oil", color: "#dd8b6f" },
  Cash: { name: "Cash", color: "#5d6f81" },
};
const targetAllocation: Record<Sector, number> = {
  "Silver miners": 30,
  "Gold miners": 20,
  "Uranium miners": 20,
  "Platinum bullion": 20,
  "Rhodium metal": 4,
  "Silver bullion": 2,
  Oil: 2,
  Cash: 2,
};

function pct(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

function fmtPct(value: number) {
  return `${value.toFixed(value >= 10 ? 1 : 1)}%`;
}

function fmtSignedAud(value: number) {
  return `${value >= 0 ? "+" : ""}${fmtAud(value)}`;
}

function fmtSignedPct(value: number | null) {
  if (value == null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
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

function fmtRunTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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

function sectorShortName(sector: Sector) {
  return sector.replace(" miners", "").replace(" bullion", "");
}

function isShareLike(holding: Holding) {
  return COMPOSITION_OF[holding.sector] === "miners" || holding.sector === "Oil";
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

function allocationDriftFor(sectors: Array<{ sector: Sector; value: number }>, total: number): AllocationDriftSummary[] {
  const current = new Map<Sector, number>(sectors.map((item) => [item.sector, item.value]));
  return (Object.keys(targetAllocation) as Sector[]).map((sector) => {
    const currentValue = current.get(sector) ?? 0;
    const targetPercent = targetAllocation[sector];
    const targetValue = total * targetPercent / 100;
    const currentPercent = pct(currentValue, total);
    return {
      sector,
      currentValue,
      targetValue,
      currentPercent,
      targetPercent,
      driftPercent: currentPercent - targetPercent,
      valueToTarget: targetValue - currentValue,
      color: SECTOR_COLORS[sector],
    };
  }).sort((a, b) => Math.abs(b.driftPercent) - Math.abs(a.driftPercent));
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
  const width = 528;
  const baseline = 160;
  const series = performance
    .map((point) => ({ label: point.date, value: valueForScope(point, scope) }))
    .filter((point): point is { label: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value) && point.value > 0)
    .slice(-90);
  const values = series.length ? series.map((point) => point.value) : [now];
  const peak = Math.max(now, ...values);
  const floor = Math.min(...values, now);
  const range = Math.max(1, peak - floor);
  const points = (series.length >= 2 ? series : [{ label: "Now", value: now }, { label: "Now", value: now }]).map((point, index, all) => {
    const x = all.length === 1 ? width : (index / Math.max(1, all.length - 1)) * width;
    const y = 132 - ((point.value - floor) / range) * 112;
    return { ...point, x, y };
  });
  const line = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const fill = `0,${baseline} ${line} ${width},${baseline}`;
  const last = points.at(-1);
  const monthLabels = points.filter((_, index) => {
    if (points.length <= 6) return true;
    return index % Math.max(1, Math.floor(points.length / 6)) === 0 || index === points.length - 1;
  }).slice(-7);

  return (
    <div className="nsHistoryPanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">Total NAV — since inception</p>
          <h2>Peak {fmtShortAud(peak)} · now {fmtShortAud(now)}</h2>
        </div>
        <div className="nsRangeTabs" aria-label="Chart range">
          <button className="isActive" type="button">All</button>
          <button type="button">6M</button>
          <button type="button">3M</button>
        </div>
      </div>
      <svg className="nsHistoryChart" viewBox="0 0 528 172" role="img" aria-label="Portfolio history chart">
        <defs>
          <linearGradient id="nsHistoryFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#d7b56d" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#d7b56d" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fill} fill="url(#nsHistoryFill)" />
        <polyline points={line} fill="none" stroke="#d7b56d" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        {last && <circle cx={last.x} cy={last.y} r="4" fill="#d7b56d" />}
      </svg>
      <div className="nsChartMonths" aria-hidden="true">
        {monthLabels.length ? monthLabels.map((point, index) => <span key={`${point.label}-${index}`}>{point.label}</span>) : <span>Now</span>}
      </div>
    </div>
  );
}

function FreshnessStrip({ syncRuns }: { syncRuns: SyncRunSummary[] }) {
  const sources = ["IBKR", "ABC Bullion"];
  const latest = sources.map((source) => syncRuns.find((run) => run.source === source));
  return (
    <section className="nsFreshnessStrip" aria-label="Data freshness">
      {latest.map((run, index) => {
        const source = sources[index];
        const status = run?.status ?? "skipped";
        return (
          <div key={source} className={`nsFreshnessItem is-${status}`}>
            <span>{source}</span>
            <strong>{run ? `${status === "success" ? "Synced" : status} · ${fmtRunTime(run.finishedAt)}` : "No run recorded"}</strong>
            <em>{run?.error ?? run?.message ?? "Waiting for first sync run."}</em>
          </div>
        );
      })}
    </section>
  );
}

function ValuationChecks({ freshness }: { freshness: ValuationFreshnessSummary[] }) {
  if (!freshness.length) return null;
  return (
    <section className="nsValuationChecks" aria-label="Valuation freshness checks">
      {freshness.map((check) => (
        <article key={check.source} className={`nsValuationCheck is-${check.status}`}>
          <div>
            <span>{check.source}</span>
            <strong>{check.status === "fresh" ? "Current" : check.status === "fallback" ? "Cost basis" : check.status}</strong>
          </div>
          <p>{check.detail}</p>
          <em>{check.ageDays == null ? fmtDate(check.asOf) : `${fmtDate(check.asOf)} · ${check.ageDays.toFixed(1)}d old`}</em>
        </article>
      ))}
    </section>
  );
}

function PeriodReturnStrip({ returns }: { returns: PeriodReturnSummary[] }) {
  if (!returns.length) return null;
  return (
    <section className="nsReturnStrip" aria-label="Period NAV movement">
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

function HoldingsTable({ holdings, total, count }: { holdings: Holding[]; total: number; count: number }) {
  const max = holdings[0]?.marketValueAud || 1;
  return (
    <section id="holdings" className="nsPanel nsPositionsPanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">Largest positions</p>
          <h2>Allocation of shares</h2>
        </div>
        <a href="/#holdings">View all {count} -&gt;</a>
      </div>
      <div className="nsHoldingsTable" role="table" aria-label="Largest share positions">
        <div className="nsHoldingsHeader" role="row">
          <span>Holding</span>
          <span>Sector · Weight</span>
          <span>Value</span>
          <span>P/L</span>
        </div>
        {holdings.slice(0, 6).map((holding) => (
          <div className="nsHoldingRow" role="row" key={holding.id}>
            <div>
              <strong>{holding.symbol}</strong>
              <span>{holding.name}</span>
            </div>
            <div>
              <em style={{ background: `${SECTOR_COLORS[holding.sector]}30`, color: SECTOR_COLORS[holding.sector] }}>{sectorShortName(holding.sector)}</em>
              <span className="nsWeightBar"><i style={{ width: `${pct(holding.marketValueAud, max)}%`, background: SECTOR_COLORS[holding.sector] }} /></span>
            </div>
            <div>
              <strong>{fmtAud(holding.marketValueAud)}</strong>
              <span>{fmtPct(pct(holding.marketValueAud, total))} of NAV</span>
            </div>
            <div className={holding.pnlAud >= 0 ? "isPositive" : "isNegative"}>
              {holding.pnlPercent >= 0 ? "+" : ""}{holding.pnlPercent.toFixed(1)}%
            </div>
          </div>
        ))}
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

function RecentActivityPanel({ syncRuns }: { syncRuns: SyncRunSummary[] }) {
  return (
    <section className="nsPanel nsActivityPanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">Recent activity</p>
          <h2>Sync and pricing runs</h2>
        </div>
      </div>
      <div className="nsActivityRows">
        {syncRuns.length ? syncRuns.slice(0, 5).map((run, index) => (
          <article key={`${run.source}-${run.finishedAt}-${index}`} className={`nsActivityRow is-${run.status}`}>
            <div>
              <strong>{run.source}</strong>
              <span>{run.trigger} · {fmtRunTime(run.finishedAt)}</span>
            </div>
            <em>{run.status}</em>
            <p>{run.error ?? run.message ?? "Completed without a message."}</p>
          </article>
        )) : (
          <article className="nsActivityRow is-skipped">
            <div>
              <strong>No sync runs recorded</strong>
              <span>Waiting for the next broker or pricing sync.</span>
            </div>
            <em>pending</em>
            <p>Recent activity will appear here after scheduled or manual syncs run.</p>
          </article>
        )}
      </div>
    </section>
  );
}

function AccountBreakdownPanel({ accounts, scope }: { accounts: AccountBreakdownSummary[]; scope: PortfolioScope }) {
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
        {visibleAccounts.map((account) => (
          <article key={account.scope} className="nsAccountItem">
            <div>
              <span>{account.label}</span>
              <strong>{fmtAud(account.netAssetValue)}</strong>
              <em>{fmtPct(account.shareOfOverall)} of total NAV</em>
            </div>
            <dl>
              <div><dt>P/L</dt><dd className={account.totalReturn >= 0 ? "isPositive" : "isNegative"}>{fmtSignedAud(account.totalReturn)} · {account.totalReturnPercent >= 0 ? "+" : ""}{account.totalReturnPercent.toFixed(1)}%</dd></div>
              <div><dt>Invested</dt><dd>{fmtAud(account.investedValue)}</dd></div>
              <div><dt>Cash</dt><dd>{fmtAud(account.cashValue)}</dd></div>
              <div><dt>Positions</dt><dd>{account.positionCount}</dd></div>
              <div><dt>Updated</dt><dd>{fmtDate(account.lastUpdated)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Full redesigned overview dashboard matching the screenshot reference. */
export function OverviewScreen({ holdings, logoSrc, performance = [], periodReturnsByScope, currencyExposureByScope, accountBreakdown = [], syncRuns = [], freshnessByScope, lastUpdatedByScope }: {
  holdings: Holding[];
  logoSrc?: string;
  performance?: PerformancePoint[];
  periodReturnsByScope?: Partial<Record<PortfolioScope, PeriodReturnSummary[]>>;
  currencyExposureByScope?: Partial<Record<PortfolioScope, CurrencyExposureSummary[]>>;
  accountBreakdown?: AccountBreakdownSummary[];
  syncRuns?: SyncRunSummary[];
  freshnessByScope?: Partial<Record<PortfolioScope, ValuationFreshnessSummary[]>>;
  lastUpdatedByScope?: Partial<Record<PortfolioScope, string | null>>;
}) {
  const [scope, setScope] = useState<PortfolioScope>("overall");
  const view = byScope(holdings, scope);
  const t = totals(view);
  const comp = byComposition(view);
  const sectors = bySector(view);
  const shareHoldings = useMemo(
    () => view.filter(isShareLike).sort((a, b) => b.marketValueAud - a.marketValueAud),
    [view],
  );
  const commodityExposure = useMemo(() => commodityExposureFor(view), [view]);
  const allocationDrift = useMemo(() => allocationDriftFor(sectors, t.marketValue), [sectors, t.marketValue]);
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
  const currencyExposure = currencyExposureByScope?.[scope] ?? currencyExposureByScope?.overall ?? [];
  const selectedUpdatedAt = lastUpdatedByScope?.[scope] ?? lastUpdatedByScope?.overall ?? null;

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
            <p><span />Valuations · {fmtLongDate(selectedUpdatedAt)}</p>
            <a className="nsReportLink" href={`/api/reports/wealth-statement?scope=${scope}`}>Export CSV</a>
          </div>
        </header>

        <FreshnessStrip syncRuns={syncRuns} />
        <ValuationChecks freshness={freshness} />

        <section className="nsHeroPanel">
          <div className="nsHeroSummary">
            <p className="nsEyebrow">{scope === "overall" ? "Total net asset value" : scope === "smsf" ? "SMSF net asset value" : "Personal net asset value"}</p>
            <div className="nsHeroValue">{fmtAud(t.marketValue)}</div>
            <div className="nsHeroStats">
              <div><span>Profit / loss</span><strong className={t.pnl >= 0 ? "isPositive" : "isNegative"}>{fmtSignedAud(t.pnl)}</strong></div>
              <div><span>Return on cost</span><strong className={t.pnl >= 0 ? "isPositive" : "isNegative"}>{t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(1)}%</strong></div>
            </div>
            <SplitBar segments={groupSegments} total={t.marketValue} />
            <SplitLegend segments={groupSegments} total={t.marketValue} />
          </div>
          <HistoryChart now={t.marketValue} scope={scope} performance={performance} />
        </section>

        <section className="nsMetricGrid" aria-label="Portfolio summary cards">
          <MetricCard label="Profit / loss" value={fmtSignedAud(t.pnl)} note={`${t.pnlPercent >= 0 ? "+" : ""}${t.pnlPercent.toFixed(1)}% on cost`} tone={t.pnl >= 0 ? "positive" : undefined} />
          <MetricCard label="Positions" value={t.count} note="stocks, ETFs & bullion" />
          <MetricCard label="Largest sector" value={largestSector?.sector ?? "No sector"} note={largestSector ? `${fmtPct(pct(largestSector.value, t.marketValue))} · ${fmtAud(largestSector.value)}` : "No holdings yet"} />
          <MetricCard label="Best performer" value={bestPerformer?.name.replace(" Metals", "") ?? "No performer"} note={bestPerformer ? `${bestPerformer.pnlPercent >= 0 ? "+" : ""}${bestPerformer.pnlPercent.toFixed(1)}% · ${bestPerformer.symbol}` : "No holdings yet"} />
        </section>

        <PeriodReturnStrip returns={periodReturns} />

        <AccountBreakdownPanel accounts={accountBreakdown} scope={scope} />

        <div className="nsLowerGrid">
          <HoldingsTable holdings={shareHoldings} total={t.marketValue} count={t.count} />
          <SectorDonut sectors={sectors} total={t.marketValue} />
        </div>

        <div className="nsAnalyticsGrid">
          <CommodityExposurePanel exposures={commodityExposure} total={t.marketValue} />
          <CurrencyExposurePanel exposures={currencyExposure} />
          <AllocationDriftPanel drift={allocationDrift} />
          <RecentActivityPanel syncRuns={syncRuns} />
        </div>
      </main>
    </div>
  );
}
