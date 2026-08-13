"use client";

import React, { useEffect, useMemo, useState } from "react";
import { NavDetailPanel } from "./NavDetailPanel";
import { buildNavSeries, type ChartValueMode, type PerformancePoint } from "../lib/nav-series";
import { fmtAud } from "../lib/portfolio-metrics";
import type { PortfolioScope } from "../types";

function fmtPct(value: number) {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function fmtShortAud(value: number) {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return fmtAud(value);
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

export function ChartOverlay({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
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

export function HistoryChart({ now, investedNow, scope, performance }: { now: number; investedNow: number; scope: PortfolioScope; performance: PerformancePoint[] }) {
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
