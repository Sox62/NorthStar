import type { PointerEvent } from "react";
import { useRef, useState } from "react";
import type { DashboardHolding } from "@/lib/storage";
import { leftReturnForBasis, ratioMovingAverageSeries, ratioReturnForBasis, ratioValueForBasis, rightReturnForBasis, type RatioBasis, type RatioMovingAverageConfig, type RatioPoint, type RelativeReturnWindow } from "@/southernstar/lib/ratio-engine";

export type RatioMode = "ratio" | "indexed";

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

function formatAxisTick(value: number, mode: RatioMode) {
  if (mode !== "ratio") return value.toFixed(1);
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

const basisText = (basis: RatioBasis) => basis === "raw_market" ? "raw ratio" : "FX normalised ratio";

function indexedValueFor(point: RatioPoint, first: RatioPoint | undefined, basis: RatioBasis, side: "left" | "right") {
  if (!first) return 100;
  const start = side === "left"
    ? basis === "raw_market" ? first.left : first.leftAud
    : basis === "raw_market" ? first.right : first.rightAud;
  const value = side === "left"
    ? basis === "raw_market" ? point.left : point.leftAud
    : basis === "raw_market" ? point.right : point.rightAud;
  return start ? value / start * 100 : 100;
}

export function RatioChart({ series, mode, basis = "fx_normalised", movingAverage, left, right }: { series: RatioPoint[]; mode: RatioMode; basis?: RatioBasis; movingAverage?: RatioMovingAverageConfig; left: DashboardHolding; right: DashboardHolding }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement | null>(null);
  const width = 920;
  const height = 360;
  const padX = 40;
  const padTop = 28;
  const padBottom = 42;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padTop - padBottom;
  const first = series[0];
  const average = movingAverage ? ratioMovingAverageSeries(series, movingAverage, basis) : [];
  const values = mode === "ratio"
    ? [...series.map((point) => ratioValueForBasis(point, basis)), ...average.map((point) => point.movingAverage).filter((value): value is number => value != null)]
    : series.flatMap((point) => [indexedValueFor(point, first, basis, "left"), indexedValueFor(point, first, basis, "right")]);
  const rawMax = values.length ? Math.max(...values) : 1;
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawRange = Math.max(0.000001, rawMax - rawMin);
  const padding = mode === "ratio" ? Math.max(rawRange * 0.08, Math.abs(rawMax) * 0.02, 0.01) : 0;
  const max = mode === "ratio" ? rawMax + padding : Math.max(rawMax, 100);
  const min = mode === "ratio" ? Math.max(0, rawMin - padding) : Math.min(rawMin, 100);
  const range = Math.max(0.000001, max - min);
  const valueFor = (point: RatioPoint, key: "ratio" | "leftIndexed" | "rightIndexed") => {
    if (key === "ratio") return ratioValueForBasis(point, basis);
    if (key === "leftIndexed") return indexedValueFor(point, first, basis, "left");
    return indexedValueFor(point, first, basis, "right");
  };
  const xy = (point: RatioPoint, index: number, key: "ratio" | "leftIndexed" | "rightIndexed") => ({
    x: padX + (series.length === 1 ? chartWidth : index / Math.max(1, series.length - 1) * chartWidth),
    y: padTop + (max - valueFor(point, key)) / range * chartHeight,
  });
  const pathFor = (key: "ratio" | "leftIndexed" | "rightIndexed") =>
    series.map((point, index) => {
      const pointXY = xy(point, index, key);
      return `${index === 0 ? "M" : "L"} ${pointXY.x.toFixed(2)} ${pointXY.y.toFixed(2)}`;
    }).join(" ");
  const movingAveragePath = average
    .filter((point) => point.movingAverage != null)
    .map((point, index) => {
      const seriesIndex = series.findIndex((seriesPoint) => seriesPoint.date === point.date);
      const x = padX + (series.length === 1 ? chartWidth : Math.max(0, seriesIndex) / Math.max(1, series.length - 1) * chartWidth);
      const y = padTop + (max - point.movingAverage!) / range * chartHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const active = hoverIndex == null ? null : series[hoverIndex];
  const activeXY = active ? xy(active, hoverIndex!, mode === "ratio" ? "ratio" : "leftIndexed") : null;
  const ticks = [max, min + range / 2, min];
  const labels = series.filter((_, index) => {
    if (series.length <= 6) return true;
    return index % Math.max(1, Math.floor(series.length / 5)) === 0 || index === series.length - 1;
  }).slice(-6);
  const onPointerMove = (event: PointerEvent<SVGElement>) => {
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
          <>
            <path className="relativeChartLine isRatio" d={pathFor("ratio")} />
            {movingAveragePath ? <path className="relativeChartLine isAverage" d={movingAveragePath} /> : null}
          </>
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
          {mode === "ratio"
            ? <strong>{ratioValueForBasis(active, basis).toFixed(2)} {basisText(basis)}</strong>
            : <strong>{left.symbol} {indexedValueFor(active, first, basis, "left").toFixed(1)} · {right.symbol} {indexedValueFor(active, first, basis, "right").toFixed(1)}</strong>}
          <em>{localPrice(active.left, left.currency)} / {localPrice(active.right, right.currency)} · FX {active.leftFxToAud.toFixed(4)} / {active.rightFxToAud.toFixed(4)}</em>
        </div>
      ) : null}
    </div>
  );
}

export function RelativePeriodCell({ window, left, right, basis = "fx_normalised" }: { window: RelativeReturnWindow; left: string; right: string; basis?: RatioBasis }) {
  const ratioReturn = ratioReturnForBasis(window, basis);
  const leftReturn = leftReturnForBasis(window, basis);
  const rightReturn = rightReturnForBasis(window, basis);
  const enoughData = window.points >= 2 && ratioReturn != null;
  const detail = enoughData
    ? window.points + " closes · " + left + " " + periodPercent(leftReturn) + " / " + right + " " + periodPercent(rightReturn) + (basis === "fx_normalised" ? " · FX " + periodPercent(window.fxContributionPercent) : "")
    : "Not enough overlap";
  return (
    <div className="relativePeriodCell">
      <span>{window.label}</span>
      <strong className={periodTone(ratioReturn)}>{periodPercent(ratioReturn)}</strong>
      <em>{detail}</em>
    </div>
  );
}
