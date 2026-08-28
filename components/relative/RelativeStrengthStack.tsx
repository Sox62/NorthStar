import { useMemo, useState, type PointerEvent } from "react";
import {
  applyRatioRange,
  ratioMovingAverageSeries,
  ratioReturnForBasis,
  type RatioBasis,
  type RatioMovingAverageConfig,
  type RatioMovingAverageType,
  type RatioPoint,
  type RatioRangeKey,
  type RatioTrendState,
} from "@/southernstar/lib/ratio-engine";
import type { RelativeStrengthStackItem } from "@/southernstar/lib/relative-strength-stack";

type StackPanel = {
  item: RelativeStrengthStackItem;
  series: RatioPoint[];
  average: ReturnType<typeof ratioMovingAverageSeries>;
};

const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;

const periodPercent = (value: number | null | undefined) => value == null ? "n/a" : percent(value);
const basisLabel = (basis: RatioBasis) => basis === "raw_market" ? "Raw Market Ratio" : "FX Normalised · AUD";
const trendLabel = (state: RatioTrendState) => state.charAt(0).toUpperCase() + state.slice(1);

const dateLabel = (value: string) => {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

export function RelativeStrengthStack({
  items,
  basis,
  range,
  movingAverage,
  onMovingAverageChange,
  onBackfill,
  backfillBusy = false,
}: {
  items: RelativeStrengthStackItem[];
  basis: RatioBasis;
  range: RatioRangeKey;
  movingAverage: RatioMovingAverageConfig;
  onMovingAverageChange: (config: RatioMovingAverageConfig) => void;
  onBackfill?: () => void;
  backfillBusy?: boolean;
}) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const panels = useMemo<StackPanel[]>(() => items.map((item) => {
    const series = applyRatioRange(item.series, range);
    return { item, series, average: ratioMovingAverageSeries(series, movingAverage, basis) };
  }), [items, range, movingAverage, basis]);
  const dateDomain = useMemo(() => {
    const times = panels.flatMap((panel) => panel.series.map((point) => dateTime(point.date)));
    if (!times.length) return null;
    const start = Math.min(...times);
    const end = Math.max(...times);
    return { start, end: end === start ? start + 24 * 60 * 60 * 1000 : end };
  }, [panels]);
  const hasMissingHistory = panels.some((panel) => panel.series.length < 2);

  const setType = (type: RatioMovingAverageType) => onMovingAverageChange({ ...movingAverage, type });
  const setPeriod = (value: string) => {
    const period = Number(value);
    if (!Number.isFinite(period)) return;
    onMovingAverageChange({ ...movingAverage, period: Math.max(2, Math.min(250, Math.round(period))) });
  };

  return (
    <section className="relativeStack">
      <div className="relativeStackHeader">
        <div>
          <p className="eyebrow">Relative Strength Stack</p>
          <h3>Market / Sector / Leader / Gold</h3>
          <span>{basisLabel(basis)} · shared time axis · explicit three-day carry-forward</span>
        </div>
        <div className="relativeStackControls">
          <div className="scopeSwitch" role="tablist" aria-label="Moving average type">
            <button type="button" className={movingAverage.type === "sma" ? "isActive" : ""} onClick={() => setType("sma")}>SMA</button>
            <button type="button" className={movingAverage.type === "ema" ? "isActive" : ""} onClick={() => setType("ema")}>EMA</button>
          </div>
          <label>
            <span>MA period</span>
            <input type="number" min="2" max="250" step="1" value={movingAverage.period} onChange={(event) => setPeriod(event.target.value)} />
          </label>
          {onBackfill ? (
            <button className="button" type="button" onClick={onBackfill} disabled={backfillBusy}>
              {backfillBusy ? "Backfilling..." : hasMissingHistory ? "Backfill stack" : "Refresh stack"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="relativeStackGrid">
        {panels.map((panel) => (
          <RelativeStrengthStackPanel
            key={panel.item.role + ":" + (panel.item.denominator.symbol ?? panel.item.denominator.id)}
            panel={panel}
            basis={basis}
            movingAverage={movingAverage}
            range={range}
            dateDomain={dateDomain}
            hoverTime={hoverTime}
            onHoverTime={setHoverTime}
          />
        ))}
      </div>
    </section>
  );
}

function RelativeStrengthStackPanel({
  panel,
  basis,
  movingAverage,
  range,
  dateDomain,
  hoverTime,
  onHoverTime,
}: {
  panel: StackPanel;
  basis: RatioBasis;
  movingAverage: RatioMovingAverageConfig;
  range: RatioRangeKey;
  dateDomain: { start: number; end: number } | null;
  hoverTime: number | null;
  onHoverTime: (value: number | null) => void;
}) {
  const { item, series, average } = panel;
  const width = 920;
  const height = 168;
  const padX = 40;
  const padTop = 18;
  const padBottom = 28;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padTop - padBottom;
  const values = [
    ...average.map((point) => point.value),
    ...average.map((point) => point.movingAverage).filter((value): value is number => value != null),
  ];
  const rawMax = values.length ? Math.max(...values) : 1;
  const rawMin = values.length ? Math.min(...values) : 0;
  const valueRange = Math.max(0.000001, rawMax - rawMin);
  const max = rawMax + Math.max(valueRange * 0.1, Math.abs(rawMax) * 0.02, 0.01);
  const min = Math.max(0, rawMin - Math.max(valueRange * 0.1, Math.abs(rawMin) * 0.02, 0.01));
  const yRange = Math.max(0.000001, max - min);
  const valueToY = (value: number) => padTop + (max - value) / yRange * chartHeight;
  const timeToX = (time: number) => {
    if (!dateDomain) return padX;
    return padX + (time - dateDomain.start) / Math.max(1, dateDomain.end - dateDomain.start) * chartWidth;
  };
  const pointToX = (point: { date: string }) => timeToX(dateTime(point.date));
  const ratioPath = average.map((point, index) => `${index === 0 ? "M" : "L"} ${pointToX(point).toFixed(2)} ${valueToY(point.value).toFixed(2)}`).join(" ");
  const maPath = average
    .filter((point) => point.movingAverage != null)
    .map((point, index) => `${index === 0 ? "M" : "L"} ${pointToX(point).toFixed(2)} ${valueToY(point.movingAverage!).toFixed(2)}`)
    .join(" ");
  const rangeWindow = item.windows.find((entry) => entry.key === range) ?? item.windows.find((entry) => entry.key === "all");
  const selectedReturn = rangeWindow ? ratioReturnForBasis(rangeWindow, basis) : null;
  const rawReturn = rangeWindow?.rawRatioReturnPercent ?? null;
  const fxContribution = rangeWindow?.fxContributionPercent ?? null;
  const latest = average.at(-1);
  const trendState = latest?.trendState ?? item.trendState;
  const activeTime = hoverTime ?? (series.at(-1) ? dateTime(series.at(-1)!.date) : null);
  const activePoint = activeTime == null ? null : nearestAveragePoint(average, activeTime);
  const activeX = activeTime == null ? null : timeToX(activeTime);
  const activeY = activePoint ? valueToY(activePoint.value) : null;
  const onPointerMove = (event: PointerEvent<SVGElement>) => {
    if (!dateDomain) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onHoverTime(dateDomain.start + ratio * (dateDomain.end - dateDomain.start));
  };

  return (
    <article className="relativeStackItem">
      <div className="relativeStackItemHeader">
        <div>
          <span>{item.label}</span>
          <strong>{item.numerator.symbol} / {item.denominator.symbol ?? item.denominator.label}</strong>
          <em>{item.denominator.label}</em>
        </div>
        <div>
          <strong className={selectedReturn == null ? "" : selectedReturn >= 0 ? "positive" : "negative"}>{periodPercent(selectedReturn)}</strong>
          <span>{trendLabel(trendState)}</span>
        </div>
      </div>
      {series.length >= 2 && dateDomain ? (
        <div className="relativeStackChartWrap">
          <svg className="relativeStackChart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${item.numerator.symbol} relative strength versus ${item.denominator.symbol ?? item.denominator.label}`}>
            {[max, min + yRange / 2, min].map((tick) => {
              const y = valueToY(tick);
              return (
                <g key={tick.toFixed(4)}>
                  <line className="relativeChartGrid" x1={padX} x2={padX + chartWidth} y1={y} y2={y} />
                  <text className="relativeChartAxis" x={padX + chartWidth - 5} y={Math.max(12, y - 5)} textAnchor="end">{formatRatio(tick)}</text>
                </g>
              );
            })}
            <path className="relativeChartLine isRatio" d={ratioPath} />
            {maPath ? <path className="relativeChartLine isAverage" d={maPath} /> : null}
            {activePoint && activeX != null && activeY != null ? (
              <>
                <line className="relativeChartCrosshair" x1={activeX} x2={activeX} y1={padTop} y2={height - padBottom} />
                <circle className="relativeChartDot" cx={pointToX(activePoint)} cy={activeY} r="4" />
              </>
            ) : null}
            <rect x="0" y="0" width={width} height={height} fill="transparent" onPointerMove={onPointerMove} onPointerLeave={() => onHoverTime(null)} />
          </svg>
          <div className="relativeStackMeta">
            <span>{movingAverage.type.toUpperCase()} {movingAverage.period}</span>
            <span>Raw {periodPercent(rawReturn)}</span>
            <span>FX {periodPercent(fxContribution)}</span>
            {activePoint ? <span>{dateLabel(activePoint.date)} · {formatRatio(activePoint.value)}</span> : null}
          </div>
        </div>
      ) : (
        <div className="relativeStackEmpty">
          <strong>No overlapping stored closes</strong>
          <span>Backfill {item.numerator.symbol} and {item.denominator.symbol ?? item.denominator.label} to build this comparison.</span>
        </div>
      )}
      {item.etfWarning ? <p className="relativeStackWarning">{item.etfWarning}</p> : null}
    </article>
  );
}

function nearestAveragePoint(points: ReturnType<typeof ratioMovingAverageSeries>, targetTime: number) {
  return points.reduce<typeof points[number] | null>((best, point) => {
    if (!best) return point;
    return Math.abs(dateTime(point.date) - targetTime) < Math.abs(dateTime(best.date) - targetTime) ? point : best;
  }, null);
}

function dateTime(value: string) {
  return new Date(`${value}T12:00:00Z`).getTime();
}

function formatRatio(value: number) {
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}
