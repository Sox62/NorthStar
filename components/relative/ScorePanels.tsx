import type { HistoricalEconomics, SouthernStarAllocationRead } from "@/components/fundamentals/detail-model";
import type { EntryScoreResult } from "@/southernstar/lib/entry-score";
import type { RelativeScoreCheck, RelativeScoreComponent } from "@/southernstar/lib/ratio-engine";

export type RelativeLayer = { label: string; target: string; score: number | null; max: number; component: RelativeScoreComponent; velocity: number | null };
export type RelativeEngineScore = { score: number | null; coverage: number; velocity: number | null; reserve: RelativeLayer; sector: RelativeLayer | null; peers: RelativeLayer; peerCount: number; peerWins: number; sentence: string };
export type OpportunitySortKey = "allocation" | "fundamental" | "relative" | "velocity" | "valuation" | "entry";
export type OpportunityRow = { symbol: string; name: string; model: string; source: string; fundamental: number | null; relative: number | null; velocity: number | null; valuation: number | null; entry: number | null; allocation: number | null; allocationLabel: string; selectionKind: "holding" | "benchmark"; selectionId: string; };

function scoreBadge(score: number | null) {
  if (score == null) return "n/a";
  if (score >= 75) return "Strong";
  if (score >= 60) return "Leading";
  if (score >= 45) return "Neutral";
  if (score >= 30) return "Lagging";
  return "Weak";
}

export function velocityLabel(value: number | null) {
  if (value == null) return "n/a";
  const rounded = Math.round(value);
  if (rounded === 0) return "0 over 30d";
  return rounded > 0 ? "up +" + rounded + " over 30d" : "down " + rounded + " over 30d";
}

function CheckDot({ available, passed }: { available: boolean; passed: boolean }) {
  const state = !available ? "muted" : passed ? "pass" : "fail";
  const label = !available ? "no data" : passed ? "yes" : "no";
  return <span className={"checkDot is-" + state} role="img" aria-label={label} title={label} />;
}

function scoreValue(value: number | null) {
  return value == null ? "-" : String(Math.round(value));
}

/** "68% evidence" — how much of a signal's basis could actually be tested. */
function coverageLabel(coverage: number | null) {
  return coverage == null ? null : Math.round(coverage * 100) + "% evidence";
}

function GaugeMeta({ coverage, basisLabel }: { coverage: number | null; basisLabel: string | null }) {
  const parts = [coverageLabel(coverage), basisLabel].filter(Boolean) as string[];
  return parts.length ? <em className="allocationGaugeMeta">{parts.join(" · ")}</em> : null;
}

function money(value: number | null) {
  if (value == null) return null;
  const millions = value / 1_000_000;
  return "A$" + (millions >= 1000 ? (millions / 1000).toFixed(2) + "bn" : millions.toFixed(0) + "m");
}

/**
 * Economics that were recorded but not allowed to price the asset. Shown rather than discarded —
 * a superseded study is still the best published description of a project, it just is not a price.
 */
function HistoricalEconomicsNote({ economics }: { economics: HistoricalEconomics }) {
  const figures = [
    money(economics.npvAud) ? money(economics.npvAud) + " NPV" : null,
    economics.irrPercent == null ? null : Math.round(economics.irrPercent) + "% IRR",
    money(economics.capexAud) ? money(economics.capexAud) + " capex" : null,
  ].filter(Boolean).join(" · ");
  const provenance = [economics.stageLabel, economics.studyDate].filter(Boolean).join(", ");
  return (
    <p className="allocationHistory">
      <strong>Historical economics:</strong> {figures || "recorded"}{provenance ? ` (${provenance})` : ""} — not scored. {economics.reason}
    </p>
  );
}

export function AllocationReadPanel({ read }: { read: SouthernStarAllocationRead }) {
  return (
    <div className="allocationReadPanel">
      <div className="allocationReadHeader">
        <div>
          <p className="eyebrow">SouthernStar allocation read</p>
          <h3>{read.allocationScore == null ? "Allocation pending" : "Allocation " + read.allocationScore} <span>{read.label}</span></h3>
          <p>{read.note}</p>
        </div>
      </div>
      <div className="allocationGaugeGrid">
        {read.gauges.map((gauge) => (
          <div className={"allocationGauge is" + gauge.tone.charAt(0).toUpperCase() + gauge.tone.slice(1)} key={gauge.key}>
            <div className="allocationGaugeTop"><span>{gauge.label}</span><strong>{gauge.score == null ? "-" : gauge.score}</strong></div>
            <b>{gauge.status}</b>
            <GaugeMeta coverage={gauge.coverage} basisLabel={gauge.basisLabel} />
            <p>{gauge.note}</p>
          </div>
        ))}
      </div>
      {read.historicalEconomics ? <HistoricalEconomicsNote economics={read.historicalEconomics} /> : null}
      {read.warning ? <p className="allocationWarning" role="status">{read.warning}</p> : null}
      <p className="relativeScoreNote">Fundamentals tell us what we are prepared to own. Relative strength tells us what the market is rewarding. Entry condition tells us when to buy or add.</p>
      <p className="relativeScoreNote"><strong>F/R/V/E are decision-support signals, not investment advice and not a buy or sell instruction.</strong> Each is a triage prompt for what to inspect next; every allocation decision stays yours, taken against the underlying sources rather than the score.</p>
    </div>
  );
}

export function EntryScorePanel({ score }: { score: EntryScoreResult }) {
  return (
    <div className="entryScorePanel">
      <div className="allocationReadHeader">
        <div>
          <p className="eyebrow">Entry condition</p>
          <h3>{score.score == null ? "Entry pending" : "Entry Score " + score.score} <span>{score.label}</span></h3>
          <p>{score.note}</p>
        </div>
      </div>
      {score.checks.length ? (
        <div className="entryCheckGrid">
          {score.checks.map((check) => (
            <div className="entryCheck" key={check.key}>
              <CheckDot available={check.available} passed={check.passed} />
              <strong>{check.label}</strong>
              <em>{check.detail}</em>
              {check.max ? <b>{Math.round(check.points)}/{check.max}</b> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OpportunityMatrix({ rows, sort, onSort, onSelect }: { rows: OpportunityRow[]; sort: OpportunitySortKey; onSort: (key: OpportunitySortKey) => void; onSelect: (row: OpportunityRow) => void }) {
  const header = (key: OpportunitySortKey, label: string) => <button type="button" onClick={() => onSort(key)}>{label}{sort === key ? " ↓" : ""}</button>;
  return (
    <div className="opportunityMatrix">
      <div className="allocationReadHeader">
        <div>
          <p className="eyebrow">Opportunity matrix</p>
          <h3>F/R/V/E watchlist</h3>
          <p>Holdings and saved ideas ranked by the signal you choose. Click a row to load its scorecard and chart context. These are decision-support signals, not investment advice or a buy/sell instruction.</p>
        </div>
      </div>
      <div className="opportunityTableWrap">
        <table className="opportunityTable">
          <thead><tr><th>Ticker</th><th>Model</th><th>{header("fundamental", "F")}</th><th>{header("relative", "R")}</th><th>{header("velocity", "Velocity")}<span className="thCaption">30d</span></th><th>{header("valuation", "V")}</th><th>{header("entry", "E")}</th><th>{header("allocation", "Allocation")}</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.selectionKind + row.selectionId} onClick={() => onSelect(row)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onSelect(row); }}>
                <td><strong>{row.symbol}</strong><span>{row.name}</span><em>{row.source}</em></td>
                <td>{row.model}</td>
                <td>{scoreValue(row.fundamental)}</td>
                <td>{scoreValue(row.relative)}</td>
                <td>{row.velocity == null ? "-" : (row.velocity >= 0 ? "+" : "") + Math.round(row.velocity)}</td>
                <td>{scoreValue(row.valuation)}</td>
                <td>{scoreValue(row.entry)}</td>
                <td><strong>{scoreValue(row.allocation)}</strong><span>{row.allocationLabel}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RelativeScorePanel({ score }: { score: RelativeEngineScore }) {
  const layers = [score.reserve, score.sector, score.peers].filter((layer): layer is RelativeLayer => Boolean(layer));
  return (
    <div className="relativeScorePanel">
      <div className="relativeScoreHero">
        <div>
          <p className="eyebrow">Relative ranking engine</p>
          <h3>{score.score == null ? "Relative Score pending" : "Relative Score " + Math.round(score.score)} <span>{scoreBadge(score.score)}</span></h3>
          <p>{score.sentence}</p>
        </div>
        <div>
          <strong>{velocityLabel(score.velocity)}</strong>
          <span>Score velocity</span>
        </div>
      </div>
      <div className="relativeScoreLayers">
        {layers.map((layer) => (
          <div className="relativeScoreLayer" key={layer.label}>
            <div className="relativeScoreLayerHead">
              <span>{layer.label} vs {layer.target}</span>
              <strong>{layer.score == null ? "-" : Math.round(layer.score)}/{layer.max}</strong>
            </div>
            {layer.label === "Peers" ? (
              <p>{score.peerCount ? "Outperforming " + score.peerWins + " of " + score.peerCount + " comparable peers." : "No comparable peer history yet."}</p>
            ) : (
              <ul>
                {layer.component.checks.map((check) => (
                  <li key={layer.label + check.key}>
                    <CheckDot available={check.available} passed={check.passed} />
                    <div><strong>{check.label}</strong><em>{check.detail}</em></div>
                    <b>{Math.round(check.points)}/{Math.round(check.max)}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="relativeScoreNote">
        Relative Score identifies what is earning capital. Entry Score is deliberately separate and not inferred here.
        {score.coverage < 1 ? " Scored on " + Math.round(score.coverage * 100) + "% of the ratio layers; the rest lack stored history." : ""}
      </p>
    </div>
  );
}
