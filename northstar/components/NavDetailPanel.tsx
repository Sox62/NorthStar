"use client";

import { useMemo, useState } from "react";
import type { PortfolioScope } from "../types";
import {
  NAV_RANGES,
  buildNavSeries,
  navSeriesStats,
  runningPeak,
  type ChartValueMode,
  type NavRange,
  type NavSeriesPoint,
  type PerformancePoint,
} from "../lib/nav-series";

const SCOPES: Array<{ id: PortfolioScope; label: string }> = [
  { id: "overall", label: "Overall" },
  { id: "personal", label: "Personal" },
  { id: "smsf", label: "SMSF" },
];

const MODES: Array<{ id: ChartValueMode; label: string }> = [
  { id: "nav", label: "NAV" },
  { id: "shares", label: "Shares" },
];

const PERSONAL_COLOR = "#77a9d8";
const SMSF_COLOR = "#8dc6a0";

const aud = (value: number) => `$${Math.round(value).toLocaleString("en-AU")}`;
const shortAud = (value: number) => Math.abs(value) >= 1e6
  ? `$${(value / 1e6).toFixed(2)}M`
  : Math.abs(value) >= 1000 ? `$${Math.round(value / 1000)}k` : aud(value);
const signedAud = (value: number) => `${value >= 0 ? "+" : "−"}${aud(Math.abs(value))}`;
const signedPct = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
const shareOf = (value: number, total: number) => `${(total ? (value / total) * 100 : 0).toFixed(2)}%`;
const fmtDay = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", ...options }).format(new Date(`${iso}T12:00:00Z`));

function TabGroup<T extends string>({ tabs, value, onChange, label }: {
  tabs: Array<{ id: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="nsNavDetailTabs" role="group" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`nsNavDetailTab${tab.id === value ? " isActive" : ""}`}
          aria-pressed={tab.id === value}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function StatRow({ label, value, note, tone }: {
  label: string;
  value: string;
  note?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="nsNavDetailRow">
      <span className="nsNavDetailRowLabel">{label}</span>
      <span className="nsNavDetailRowValue">
        <strong className={tone ? `is-${tone}` : undefined}>{value}</strong>
        {note ? <em>{note}</em> : null}
      </span>
    </div>
  );
}

export function NavDetailPanel({ performance, scope: initialScope, mode: initialMode }: {
  performance: PerformancePoint[];
  scope: PortfolioScope;
  mode: ChartValueMode;
}) {
  const [scope, setScope] = useState<PortfolioScope>(initialScope);
  const [mode, setMode] = useState<ChartValueMode>(initialMode);
  const [range, setRange] = useState<NavRange>("itd");
  const [hover, setHover] = useState<number | null>(null);

  const series = useMemo(
    () => buildNavSeries({ performance, scope, mode, range }),
    [performance, scope, mode, range],
  );
  const stats = useMemo(() => navSeriesStats(series), [series]);

  if (series.length < 2 || !stats) {
    return (
      <p className="nsNavDetailEmpty">
        Not enough dated snapshots to chart this range yet. Snapshots accumulate on each sync.
      </p>
    );
  }

  const showOwnerLines = scope === "overall"
    && series.some((point) => point.personal !== undefined)
    && series.some((point) => point.smsf !== undefined);

  const span = Math.max(1, stats.peak - stats.floor);
  const pad = span * 0.12;
  const low = stats.floor - pad;
  const high = stats.peak + pad;
  const heightSpan = Math.max(1, high - low);
  const x = (index: number) => (index / Math.max(1, series.length - 1)) * 900;
  const y = (value: number) => 268 - ((value - low) / heightSpan) * 256;
  const poly = (pick: (point: NavSeriesPoint) => number | undefined) => series
    .map((point, index) => {
      const value = pick(point);
      return value === undefined ? null : `${x(index).toFixed(1)},${y(value).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  const index = hover == null ? series.length - 1 : Math.min(series.length - 1, Math.max(0, hover));
  const point = series[index];
  const previous = series[index - 1] ?? point;
  const first = series[0];
  const dayDelta = point.value - previous.value;
  const rangeDelta = point.value - first.value;
  const peakToDate = runningPeak(series, index);
  const drawdown = peakToDate ? ((point.value - peakToDate) / peakToDate) * 100 : 0;

  const cashPercents = series.map((item) => (item.nav ? (item.cash / item.nav) * 100 : 0));
  const cashLow = Math.min(...cashPercents) - 1;
  const cashHigh = Math.max(...cashPercents) + 1;
  const cashY = (value: number) => 64 - ((value - cashLow) / Math.max(0.5, cashHigh - cashLow)) * 56;
  const cashLine = cashPercents.map((value, position) => `${x(position).toFixed(1)},${cashY(value).toFixed(1)}`).join(" ");

  const gridLines = Array.from({ length: 4 }, (_, position) => {
    const value = high - (position / 3) * heightSpan;
    const lineY = y(value);
    return { key: position, y: lineY, labelY: Math.max(11, lineY - 5), label: shortAud(value) };
  });
  const axisLabels = Array.from({ length: 6 }, (_, position) => {
    const item = series[Math.round((position / 5) * (series.length - 1))];
    return { key: `${item.date}-${position}`, text: fmtDay(item.date, { month: "short", year: "2-digit" }) };
  });

  const rangeLabel = NAV_RANGES.find((item) => item.id === range)?.label ?? "";
  const rangeCaption = range === "itd" ? "since inception" : `over ${rangeLabel}`;
  const ownerRows = scope === "overall"
    ? [
        { key: "personal", label: "Personal", color: PERSONAL_COLOR, value: point.personal ?? 0 },
        { key: "smsf", label: "SMSF", color: SMSF_COLOR, value: point.smsf ?? 0 },
      ]
    : [{ key: scope, label: scope === "smsf" ? "SMSF" : "Personal", color: "var(--accent)", value: point.nav }];

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (series.length - 1)));
  };
  const clearHover = () => setHover(null);

  return (
    <div className="nsNavDetail">
      <div className="nsNavDetailControls">
        <p className="nsNavDetailCoverage">
          {series.length} snapshot{series.length === 1 ? "" : "s"} · {fmtDay(first.date, { day: "numeric", month: "short", year: "numeric" })} to {fmtDay(series[series.length - 1].date, { day: "numeric", month: "short", year: "numeric" })}
        </p>
        <div className="nsNavDetailTabSets">
          <TabGroup tabs={SCOPES} value={scope} onChange={(next) => { setScope(next); clearHover(); }} label="Portfolio scope" />
          <TabGroup tabs={MODES} value={mode} onChange={(next) => { setMode(next); clearHover(); }} label="Value basis" />
          <TabGroup tabs={NAV_RANGES.map(({ id, label }) => ({ id, label }))} value={range} onChange={(next) => { setRange(next); clearHover(); }} label="Date range" />
        </div>
      </div>

      <div className="nsNavDetailGrid">
        <div className="nsNavDetailMain">
          <div className="nsNavDetailChartCard">
            <svg
              className="nsNavDetailChart"
              viewBox="0 0 900 300"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${mode === "shares" ? "Invested value" : "Net asset value"} over ${rangeCaption}`}
              onPointerMove={onPointerMove}
              onPointerLeave={clearHover}
            >
              <defs>
                <linearGradient id="nsNavDetailFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#d7b56d" stopOpacity="0.34" />
                  <stop offset="100%" stopColor="#d7b56d" stopOpacity="0" />
                </linearGradient>
              </defs>
              {gridLines.map((line) => (
                <g key={line.key}>
                  <line className="nsChartGridLine" x1="0" x2="900" y1={line.y} y2={line.y} />
                  <text className="nsChartAxisLabel" x="898" y={line.labelY} textAnchor="end">{line.label}</text>
                </g>
              ))}
              <polygon points={`0,268 ${poly((item) => item.value)} 900,268`} fill="url(#nsNavDetailFill)" />
              {showOwnerLines ? (
                <>
                  <polyline points={poly((item) => item.personal)} fill="none" stroke={PERSONAL_COLOR} strokeWidth="1.6" strokeLinejoin="round" />
                  <polyline points={poly((item) => item.smsf)} fill="none" stroke={SMSF_COLOR} strokeWidth="1.6" strokeLinejoin="round" />
                </>
              ) : null}
              <polyline points={poly((item) => item.value)} fill="none" stroke="#d7b56d" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              {hover != null ? (
                <>
                  <line className="nsChartCrosshair" x1={x(index)} x2={x(index)} y1="8" y2="268" />
                  <circle cx={x(index)} cy={y(point.value)} r="5" fill="#071019" stroke="#d7b56d" strokeWidth="2.4" />
                </>
              ) : (
                <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].value)} r="3.5" fill="#d7b56d" />
              )}
            </svg>
            <div className="nsNavDetailAxis" aria-hidden="true">
              {axisLabels.map((label) => <span key={label.key}>{label.text}</span>)}
            </div>
            {hover != null ? (
              <div
                className="nsNavDetailTip"
                style={{ left: `${(x(index) / 900) * 100}%`, transform: x(index) > 620 ? "translateX(calc(-100% - 14px))" : "translateX(14px)" }}
              >
                <span>{fmtDay(point.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                <strong>{aud(point.value)}</strong>
                <em className={dayDelta >= 0 ? "is-positive" : "is-negative"}>
                  {signedAud(dayDelta)} ({signedPct(previous.value ? (dayDelta / previous.value) * 100 : 0)}) on prior close
                </em>
              </div>
            ) : null}
          </div>

          <div className="nsNavDetailChartCard isCash">
            <div className="nsNavDetailCardHead">
              <p className="nsEyebrow">Invested vs cash</p>
              <span>Cash share of NAV, {rangeCaption}</span>
            </div>
            <svg
              className="nsNavDetailCashChart"
              viewBox="0 0 900 74"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Cash as a share of net asset value, ${rangeCaption}`}
              onPointerMove={onPointerMove}
              onPointerLeave={clearHover}
            >
              <line className="nsChartGridLine" x1="0" x2="900" y1="68" y2="68" />
              <polygon points={`0,68 ${cashLine} 900,68`} fill="rgba(119,169,216,0.22)" />
              <polyline points={cashLine} fill="none" stroke={PERSONAL_COLOR} strokeWidth="1.8" strokeLinejoin="round" />
              {hover != null ? <line className="nsChartCrosshair" x1={x(index)} x2={x(index)} y1="4" y2="68" /> : null}
            </svg>
            <div className="nsNavDetailAxis" aria-hidden="true">
              <span>{Math.max(0, cashLow + 1).toFixed(1)}% low</span>
              <span>{(cashHigh - 1).toFixed(1)}% high</span>
            </div>
          </div>
        </div>

        <div className="nsNavDetailSide">
          <div className="nsNavDetailCard">
            <div className="nsNavDetailCardHead">
              <p className="nsEyebrow">{hover == null ? "Latest snapshot" : "Scanned snapshot"}</p>
              <span>{fmtDay(point.date, { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
            <strong className="nsNavDetailReadout">{aud(point.value)}</strong>
            <div className="nsNavDetailReadoutMeta">
              <span className={rangeDelta >= 0 ? "is-positive" : "is-negative"}>
                {signedAud(rangeDelta)} · {signedPct(first.value ? (rangeDelta / first.value) * 100 : 0)}
              </span>
              <span>{rangeCaption}</span>
            </div>
          </div>

          <div className="nsNavDetailCard">
            <p className="nsEyebrow">Ownership at this date</p>
            <div className="nsNavDetailSplit" aria-hidden="true">
              {ownerRows.map((row) => (
                <span key={row.key} style={{ width: `${point.nav ? (row.value / point.nav) * 100 : 0}%`, background: row.color }} />
              ))}
            </div>
            <div className="nsNavDetailRows">
              {ownerRows.map((row) => (
                <div className="nsNavDetailRow" key={row.key}>
                  <span className="nsNavDetailRowLabel">
                    <span className="nsNavDetailSwatch" style={{ background: row.color }} />{row.label}
                  </span>
                  <span className="nsNavDetailRowValue">
                    <strong>{aud(row.value)}</strong><em>{shareOf(row.value, point.nav)}</em>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="nsNavDetailCard">
            <p className="nsEyebrow">Composition at this date</p>
            <div className="nsNavDetailRows">
              <StatRow label="Invested (market value)" value={aud(point.invested)} note={shareOf(point.invested, point.nav)} />
              <StatRow label="Cash balance" value={aud(point.cash)} note={shareOf(point.cash, point.nav)} />
              <StatRow label="Net asset value" value={aud(point.nav)} note="100%" />
            </div>
          </div>

          <div className="nsNavDetailCard">
            <p className="nsEyebrow">Range statistics</p>
            <div className="nsNavDetailRows">
              <StatRow label="Peak" value={aud(stats.peak)} note={fmtDay(stats.peakDate, { day: "numeric", month: "short", year: "2-digit" })} />
              <StatRow label="Low" value={aud(stats.floor)} note={fmtDay(stats.floorDate, { day: "numeric", month: "short", year: "2-digit" })} />
              <StatRow label="Drawdown from peak" value={signedPct(drawdown)} note={signedAud(point.value - peakToDate)} tone={point.value < peakToDate ? "negative" : "positive"} />
              <StatRow label="Best day" value={signedPct(stats.bestDayPercent)} note="in range" tone="positive" />
              <StatRow label="Worst day" value={signedPct(stats.worstDayPercent)} note="in range" tone="negative" />
            </div>
          </div>

          <p className="nsNavDetailFootnote">
            Values are dated portfolio snapshots. Cash is the reported broker cash balance; invested is snapshot market value.
          </p>
        </div>
      </div>
    </div>
  );
}
