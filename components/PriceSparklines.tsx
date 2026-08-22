"use client";

import { useMemo, useState } from "react";
import { Card } from "@/southernstar/components";
import { buildSparklines, sparklinePoints, type SparkInstrument, type SparkPriceRow } from "@/southernstar/lib/sparkline";
import styles from "./PriceSparklines.module.css";

const WIDTH = 220;
const HEIGHT = 46;

const RANGES: Array<{ key: string; label: string; days: number | null }> = [
  { key: "1m", label: "1M", days: 31 },
  { key: "3m", label: "3M", days: 92 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "all", label: "All", days: null },
];

const fmtDate = (value: string) =>
  new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));

const fmtPrice = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString("en-AU", { minimumFractionDigits: value >= 100 ? 2 : 3, maximumFractionDigits: value >= 100 ? 2 : 4 })}`;

const fmtPct = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;

export function PriceSparklines({ prices, instruments }: { prices: SparkPriceRow[]; instruments: SparkInstrument[] }) {
  const [range, setRange] = useState("3m");
  const [hover, setHover] = useState<number | null>(null);

  const days = RANGES.find((item) => item.key === range)?.days ?? null;
  const { dates, series } = useMemo(
    () => buildSparklines({ prices, instruments, days }),
    [prices, instruments, days],
  );

  if (!series.length) {
    return (
      <Card>
        <p className="eyebrow">Chart workbench</p>
        <p className="empty">
          No stored price history yet. Refresh quotes or backfill history and the sparklines appear here.
        </p>
      </Card>
    );
  }

  const index = hover == null ? dates.length - 1 : Math.min(dates.length - 1, Math.max(0, hover));
  const scrub = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (dates.length - 1)));
  };

  return (
    <Card>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Chart workbench</p>
          <h2 className="cardTitle">{series.length} instruments · {hover == null ? "latest" : fmtDate(dates[index])}</h2>
        </div>
        <div className={styles.ranges} role="group" aria-label="Range">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.range}${item.key === range ? ` ${styles.isActive}` : ""}`}
              aria-pressed={item.key === range}
              onClick={() => { setRange(item.key); setHover(null); }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid} onPointerLeave={() => setHover(null)}>
        {series.map((item) => {
          const value = item.values[index];
          const shown = Number.isFinite(value) ? value : item.latest;
          const change = item.first ? ((shown - item.first) / item.first) * 100 : 0;
          const cx = (index / Math.max(1, dates.length - 1)) * WIDTH;
          return (
            <div className={styles.panel} key={item.key}>
              <div className={styles.panelHead}>
                <span className={styles.symbol}>{item.label}</span>
                <span className={change >= 0 ? styles.positive : styles.negative}>{fmtPct(change)}</span>
              </div>
              <div className={styles.readout}>{fmtPrice(shown, item.currency)}</div>
              <svg
                className={styles.spark}
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`${item.label} ${fmtPct(change)} over the selected range`}
                onPointerMove={scrub}
              >
                <polyline
                  points={sparklinePoints(item.values, WIDTH, HEIGHT)}
                  fill="none"
                  stroke={change >= 0 ? "var(--status-positive)" : "var(--status-negative)"}
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {hover != null ? (
                  <line x1={cx} x2={cx} y1="0" y2={HEIGHT} stroke="var(--text-muted)" strokeWidth="1" opacity="0.5" vectorEffect="non-scaling-stroke" />
                ) : null}
              </svg>
            </div>
          );
        })}
      </div>

      <div className={styles.axis} aria-hidden="true">
        <span>{fmtDate(dates[0])}</span>
        <span>{dates.length} sessions · one crosshair across every panel</span>
        <span>{fmtDate(dates[dates.length - 1])}</span>
      </div>
    </Card>
  );
}
