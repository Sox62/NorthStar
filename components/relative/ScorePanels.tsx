import type { SouthernStarAllocationRead } from "@/components/fundamentals/detail-model";
import type { EntryScoreResult } from "@/southernstar/lib/entry-score";
import type { RelativeScoreCheck, RelativeScoreComponent } from "@/southernstar/lib/ratio-engine";

export type RelativeLayer = { label: string; target: string; score: number; max: number; component: RelativeScoreComponent; velocity: number | null };
export type RelativeEngineScore = { score: number; velocity: number | null; reserve: RelativeLayer; sector: RelativeLayer | null; peers: RelativeLayer; peerCount: number; peerWins: number; sentence: string };
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

function checkMark(check: RelativeScoreCheck) {
  if (!check.available) return "-";
  return check.passed ? "yes" : "no";
}

function scoreValue(value: number | null) {
  return value == null ? "-" : String(Math.round(value));
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
            <p>{gauge.note}</p>
          </div>
        ))}
      </div>
      <p className="relativeScoreNote">Fundamentals tell us what we are prepared to own. Relative strength tells us what the market is rewarding. Entry condition tells us when to buy or add.</p>
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
              <span>{check.available ? check.passed ? "yes" : "no" : "-"}</span>
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
          <p>Holdings and saved ideas ranked by the signal you choose. Click a row to load its scorecard and chart context.</p>
        </div>
      </div>
      <div className="opportunityTableWrap">
        <table className="opportunityTable">
          <thead><tr><th>Ticker</th><th>Model</th><th>{header("fundamental", "F")}</th><th>{header("relative", "R")}</th><th>{header("velocity", "Delta R30")}</th><th>{header("valuation", "V")}</th><th>{header("entry", "E")}</th><th>{header("allocation", "Allocation")}</th></tr></thead>
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
          <h3>Relative Score {Math.round(score.score)} <span>{scoreBadge(score.score)}</span></h3>
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
              <strong>{Math.round(layer.score)}/{layer.max}</strong>
            </div>
            {layer.label === "Peers" ? (
              <p>{score.peerCount ? "Outperforming " + score.peerWins + " of " + score.peerCount + " comparable peers." : "No comparable peer history yet."}</p>
            ) : (
              <ul>
                {layer.component.checks.map((check) => (
                  <li key={layer.label + check.key}>
                    <span>{checkMark(check)}</span>
                    <div><strong>{check.label}</strong><em>{check.detail}</em></div>
                    <b>{Math.round(check.points)}/{Math.round(check.max)}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="relativeScoreNote">Relative Score identifies what is earning capital. Entry Score is deliberately separate and not inferred here.</p>
    </div>
  );
}
