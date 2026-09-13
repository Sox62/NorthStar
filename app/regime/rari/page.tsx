"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, Notice, StatusBadge } from "@/southernstar/components";

type RariRange = "1Y" | "3Y" | "5Y" | "10Y" | "MAX";
type ComponentStatus = "valid" | "missing" | "stale" | "insufficient_data";

type RariComponent = {
  id: string;
  name: string;
  description: string;
  weight: number;
  direction: "positive" | "inverse";
  status: ComponentStatus;
  score: number | null;
  value: number | null;
  numeratorValue: number | null;
  denominatorValue: number | null;
  weightedContribution: number | null;
  trendDirection: "up" | "down" | "flat" | "unknown";
  sixMonthRoc: number | null;
  twelveMonthRoc: number | null;
  movingAverage: number | null;
  movingAverageRelationship: "above" | "below" | "at" | "unavailable";
  movingAverageSlope: number | null;
  messages: string[];
};

type RariPoint = {
  date: string;
  score: number | null;
  status: "valid" | "partial" | "stale" | "insufficient_data";
  regimeLabel: string | null;
  components: RariComponent[];
};

type RariDefinition = {
  components: Array<{
    id: string;
    name: string;
    weight: number;
    numerator: { symbol: string; exchange?: string };
    denominator?: { symbol: string; exchange?: string };
  }>;
  thresholds: Array<{ id: string; label: string; min: number; max: number }>;
};

type CurrentPayload = {
  score: number | null;
  regime: string | null;
  regimeLabel: string | null;
  asOf: string | null;
  status: RariPoint["status"];
  changes: { day: number | null; week: number | null; month: number | null };
  components: RariComponent[];
  lastCalculationTimestamp: string | null;
  messages: string[];
  definition: RariDefinition;
  error?: string;
};

type HistoryPayload = {
  range: RariRange;
  points: RariPoint[];
  spx: Array<{ date: string; close: number; indexed: number | null }>;
  gold: Array<{ date: string; close: number; indexed: number | null }>;
  error?: string;
};

const ranges: RariRange[] = ["1Y", "3Y", "5Y", "10Y", "MAX"];

const number = (value: number | null | undefined, maximumFractionDigits = 1) =>
  value == null ? "n/a" : value.toLocaleString("en-AU", { maximumFractionDigits });
const signed = (value: number | null | undefined) =>
  value == null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}`;
const percent = (value: number | null | undefined) =>
  value == null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;
const dateLabel = (value: string | null | undefined) => {
  if (!value) return "n/a";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

export default function RariPage() {
  const [range, setRange] = useState<RariRange>("3Y");
  const [current, setCurrent] = useState<CurrentPayload | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"backfill" | "recompute" | "research" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [research, setResearch] = useState<{ score: number | null; regimeLabel: string | null; status: string } | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [scoring, setScoring] = useState({ movingAverageDays: 200, slopeLookbackDays: 20, roc6mDays: 183, roc12mDays: 366 });

  const load = async (selectedRange = range) => {
    setLoading(true);
    setError(null);
    try {
      const [currentResponse, historyResponse] = await Promise.all([
        fetch("/api/regime/rari", { cache: "no-store" }),
        fetch(`/api/regime/rari/history?range=${selectedRange}`, { cache: "no-store" }),
      ]);
      const currentPayload = await currentResponse.json() as CurrentPayload;
      const historyPayload = await historyResponse.json() as HistoryPayload;
      if (!currentResponse.ok || currentPayload.error) throw new Error(currentPayload.error || "Unable to load RARI.");
      if (!historyResponse.ok || historyPayload.error) throw new Error(historyPayload.error || "Unable to load RARI history.");
      setCurrent(currentPayload);
      setHistory(historyPayload);
      setWeights(Object.fromEntries(currentPayload.definition.components.map((component) => [component.id, component.weight])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load RARI.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(range); }, [range]);

  const backfill = async () => {
    if (!current) return;
    setBusy("backfill");
    setNotice(null);
    setError(null);
    try {
      const symbols = [...new Set(current.definition.components.flatMap((component) => [
        `${component.numerator.symbol}:${component.numerator.exchange ?? ""}`,
        component.denominator ? `${component.denominator.symbol}:${component.denominator.exchange ?? ""}` : "",
      ]).filter(Boolean))];
      const response = await fetch("/api/prices/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ range: "max", symbols, includeFx: false }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Backfill failed.");
      setNotice(`${payload.imported ?? 0} historical closes stored for RARI inputs.`);
      await recompute(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Backfill failed.");
    } finally {
      setBusy(null);
    }
  };

  const recompute = async (showNotice = true) => {
    setBusy("recompute");
    setError(null);
    if (showNotice) setNotice(null);
    try {
      const response = await fetch("/api/regime/rari/recompute", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Recompute failed.");
      if (showNotice) setNotice(`${payload.persisted ?? 0} RARI rows recalculated from stored market data.`);
      await load(range);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Recompute failed.");
    } finally {
      setBusy(null);
    }
  };

  const previewResearch = async () => {
    setBusy("research");
    setError(null);
    setResearch(null);
    try {
      const response = await fetch("/api/regime/rari/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weights, scoring, range }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Research preview failed.");
      setResearch({
        score: payload.current?.score ?? null,
        regimeLabel: payload.current?.regimeLabel ?? null,
        status: payload.current?.status ?? "insufficient_data",
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Research preview failed.");
    } finally {
      setBusy(null);
    }
  };

  const weightTotal = useMemo(() => Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0), [weights]);
  const statusTone = current?.status === "valid" ? "good" : current?.status === "partial" ? "warning" : "bad";

  return (
    <main className="shell">
      <PageHeader title="Real Asset Rotation" description="Market regime evidence for real-asset leadership, breadth deterioration and purchasing-power pressure." />

      {error && <Notice tone="error" title="RARI needs attention">{error}</Notice>}
      {notice && <Notice tone="success" title="RARI updated">{notice}</Notice>}

      <section className="rariHeroGrid">
        <Card className="rariScoreCard">
          <div className="rariCardTopline">
            <p className="eyebrow">Market Regime</p>
            {current && <StatusBadge tone={statusTone}>{current.status.replaceAll("_", " ")}</StatusBadge>}
          </div>
          <div className="rariScore">{loading ? "..." : current?.score == null ? "n/a" : current.score.toFixed(0)}</div>
          <h2>{current?.regimeLabel ?? "Insufficient Evidence"}</h2>
          <dl className="rariChangeGrid">
            <div><dt>1D</dt><dd>{signed(current?.changes.day)}</dd></div>
            <div><dt>1W</dt><dd>{signed(current?.changes.week)}</dd></div>
            <div><dt>1M</dt><dd>{signed(current?.changes.month)}</dd></div>
            <div><dt>As of</dt><dd>{dateLabel(current?.asOf)}</dd></div>
          </dl>
          <div className="rariActions">
            <button className="primary" type="button" onClick={backfill} disabled={!current || busy != null}>{busy === "backfill" ? "Backfilling..." : "Backfill inputs"}</button>
            <button className="button" type="button" onClick={() => recompute()} disabled={busy != null}>{busy === "recompute" ? "Recomputing..." : "Recompute"}</button>
          </div>
        </Card>

        <Card className="rariChartCard">
          <div className="rariCardTopline">
            <div>
              <p className="eyebrow">Historical RARI</p>
              <h2>RARI with SPY and gold context</h2>
            </div>
            <div className="nsRangeTabs" aria-label="RARI chart range">
              {ranges.map((item) => (
                <button key={item} className={range === item ? "isActive" : ""} type="button" onClick={() => setRange(item)}>{item}</button>
              ))}
            </div>
          </div>
          <RariChart points={history?.points ?? []} spx={history?.spx ?? []} gold={history?.gold ?? []} />
        </Card>
      </section>

      {current?.messages?.length ? (
        <Notice tone={current.status === "valid" ? "neutral" : "error"} title="Calculation audit">
          {current.messages.slice(0, 4).join(" ")}
        </Notice>
      ) : null}

      <section className="rariGrid">
        <Card>
          <div className="rariCardTopline">
            <div>
              <p className="eyebrow">Component Breakdown</p>
              <h2>Why the score is what it is</h2>
            </div>
          </div>
          <div className="rariTableWrap">
            <table className="rariTable">
              <thead>
                <tr>
                  <th>Component</th>
                  <th className="numeric">Score</th>
                  <th className="numeric">Value</th>
                  <th className="numeric">Weight</th>
                  <th className="numeric">Contribution</th>
                  <th className="numeric">6M ROC</th>
                  <th className="numeric">12M ROC</th>
                  <th>200DMA</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {(current?.components ?? []).map((component) => (
                  <tr key={component.id}>
                    <td>
                      <strong>{component.name}</strong>
                      <small>{component.description}</small>
                      {component.status !== "valid" && <em>{component.messages[0] ?? component.status}</em>}
                    </td>
                    <td className="numeric">{number(component.score, 0)}</td>
                    <td className="numeric">{number(component.value, 2)}</td>
                    <td className="numeric">{component.weight}%</td>
                    <td className="numeric">{number(component.weightedContribution, 1)}</td>
                    <td className="numeric">{percent(component.sixMonthRoc)}</td>
                    <td className="numeric">{percent(component.twelveMonthRoc)}</td>
                    <td>{component.movingAverageRelationship === "unavailable" ? "n/a" : `${component.movingAverageRelationship} (${number(component.movingAverage, 2)})`}</td>
                    <td><span className={`rariTrend is-${component.trendDirection}`}>{trendLabel(component.trendDirection)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="rariCardTopline">
            <div>
              <p className="eyebrow">Research Preview</p>
              <h2>Non-persistent configuration test</h2>
            </div>
            <StatusBadge tone={Math.abs(weightTotal - 100) < 0.001 ? "good" : "warning"}>{number(weightTotal, 1)}%</StatusBadge>
          </div>
          <div className="rariResearchGrid">
            {(current?.definition.components ?? []).map((component) => (
              <label key={component.id} className="rariInputRow">
                <span>{component.name}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={weights[component.id] ?? component.weight}
                  onChange={(event) => setWeights((values) => ({ ...values, [component.id]: Number(event.target.value) }))}
                />
              </label>
            ))}
          </div>
          <div className="rariScoringGrid">
            {[
              ["movingAverageDays", "MA days"],
              ["slopeLookbackDays", "Slope"],
              ["roc6mDays", "6M days"],
              ["roc12mDays", "12M days"],
            ].map(([key, label]) => (
              <label key={key} className="rariInputRow">
                <span>{label}</span>
                <input
                  type="number"
                  min="1"
                  value={scoring[key as keyof typeof scoring]}
                  onChange={(event) => setScoring((value) => ({ ...value, [key]: Number(event.target.value) }))}
                />
              </label>
            ))}
          </div>
          <div className="rariActions">
            <button className="primary" type="button" onClick={previewResearch} disabled={busy != null || Math.abs(weightTotal - 100) > 0.001}>
              {busy === "research" ? "Running..." : "Preview"}
            </button>
            {research && <p className="rariResearchResult">Preview: <strong>{research.score == null ? "n/a" : research.score.toFixed(0)}</strong> · {research.regimeLabel ?? research.status}</p>}
          </div>
        </Card>
      </section>
    </main>
  );
}

function RariChart({ points, spx, gold }: {
  points: RariPoint[];
  spx: Array<{ date: string; indexed: number | null }>;
  gold: Array<{ date: string; indexed: number | null }>;
}) {
  const valid = points.filter((point) => point.score != null);
  const width = 760;
  const height = 260;
  const pad = { top: 18, right: 34, bottom: 28, left: 34 };
  const contextHeight = 92;
  const contextPad = { top: 10, right: 34, bottom: 24, left: 34 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const contextChartHeight = contextHeight - contextPad.top - contextPad.bottom;
  const spxRows = spx.filter((point) => point.indexed != null);
  const goldRows = gold.filter((point) => point.indexed != null);
  const timeline = [...new Set([
    ...valid.map((point) => point.date),
    ...spxRows.map((point) => point.date),
    ...goldRows.map((point) => point.date),
  ])].sort();
  const dateToX = new Map(timeline.map((date, index) => [
    date,
    pad.left + (timeline.length <= 1 ? chartWidth : index / (timeline.length - 1) * chartWidth),
  ]));
  const rariLine = linePath(valid.map((point, index) => ({
    x: dateToX.get(point.date) ?? (pad.left + (valid.length <= 1 ? chartWidth : index / (valid.length - 1) * chartWidth)),
    y: pad.top + chartHeight - ((point.score ?? 0) / 100) * chartHeight,
  })));
  const overlayValues = [...spxRows, ...goldRows].map((point) => point.indexed ?? 100);
  const overlayMin = overlayValues.length ? Math.min(...overlayValues, 100) : 0;
  const overlayMax = overlayValues.length ? Math.max(...overlayValues, 100) : 100;
  const overlayRange = Math.max(1, overlayMax - overlayMin);
  const overlayLine = (rows: Array<{ date: string; indexed: number | null }>) => linePath(rows.flatMap((point) => {
    const x = dateToX.get(point.date);
    if (x == null || point.indexed == null) return [];
    return [{
      x,
      y: contextPad.top + contextChartHeight - ((point.indexed - overlayMin) / overlayRange) * contextChartHeight,
    }];
  }));
  const spxLine = overlayLine(spxRows);
  const goldLine = overlayLine(goldRows);
  const overlayBaselineY = contextPad.top + contextChartHeight - ((100 - overlayMin) / overlayRange) * contextChartHeight;
  const latest = valid.at(-1);

  return (
    <div className="rariChartWrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="RARI historical score chart">
        {[25, 45, 60, 75].map((level) => {
          const y = pad.top + chartHeight - level / 100 * chartHeight;
          return <line key={level} className="rariGridLine" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />;
        })}
        <rect className="rariBand rariBandStrong" x={pad.left} y={pad.top} width={chartWidth} height={chartHeight * 0.25} />
        <rect className="rariBand rariBandTransition" x={pad.left} y={pad.top + chartHeight * 0.4} width={chartWidth} height={chartHeight * 0.15} />
        <path className="rariLine" d={rariLine} />
        {[0, 25, 50, 75, 100].map((level) => {
          const y = pad.top + chartHeight - level / 100 * chartHeight;
          return <text key={level} className="rariAxisLabel" x={width - 4} y={y + 4} textAnchor="end">{level}</text>;
        })}
      </svg>
      <svg className="rariContextChart" viewBox={`0 0 ${width} ${contextHeight}`} role="img" aria-label="SPY and gold indexed price context">
        <line className="rariContextBaseline" x1={contextPad.left} x2={width - contextPad.right} y1={overlayBaselineY} y2={overlayBaselineY} />
        <path className="rariSpxLine" d={spxLine} />
        <path className="rariGoldPriceLine" d={goldLine} />
        <text className="rariAxisLabel" x={width - 4} y={Math.max(contextPad.top + 8, Math.min(contextHeight - contextPad.bottom, overlayBaselineY + 4))} textAnchor="end">100</text>
        <text className="rariContextLabel" x={contextPad.left} y={contextHeight - 6}>SPY and gold indexed to 100</text>
      </svg>
      <div className="rariChartLegend">
        <span><i className="rariLegendRari" />RARI score</span>
        <span><i className="rariLegendBlue" />SPY indexed</span>
        <span><i className="rariLegendGold" />Gold indexed</span>
        <strong>{latest ? `${dateLabel(latest.date)} · ${latest.score?.toFixed(0)}` : "No scored history"}</strong>
      </div>
    </div>
  );
}

function linePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function trendLabel(direction: RariComponent["trendDirection"]) {
  if (direction === "up") return "↑";
  if (direction === "down") return "↓";
  if (direction === "flat") return "→";
  return "n/a";
}
