import type { MinerFundamentals } from "@/lib/storage";
import { Card, SectorTag, StatusBadge } from "@/southernstar/components";
import type { Holding } from "@/southernstar/types";
import { SECTOR_COLORS } from "@/southernstar/types";
import {
  averageScore,
  dateOrDash,
  money,
  moneyOrDash,
  numberOrDash,
  percent,
  scoreStatus,
} from "./model";
import styles from "./FundamentalsRisk.module.css";

type HeldMinerTableProps = {
  holdings: Holding[];
  fundamentalsBySymbol: Map<string, MinerFundamentals>;
  loading: boolean;
  totalMinerValue: number;
  onSelect: (holding: Holding) => void;
};

export function HeldMinerTable({ holdings, fundamentalsBySymbol, loading, totalMinerValue, onSelect }: HeldMinerTableProps) {
  return (
    <Card className={styles.tableCard}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Current candidates</p>
          <h2 className="cardTitle">Miner fundamentals queue</h2>
        </div>
        <StatusBadge tone="warning">
          {loading ? "Loading" : `${holdings.length} miners`}
        </StatusBadge>
      </div>

      <div className="holdingsTableWrap">
        <table className={`holdingsTable ${styles.table}`}>
          <thead>
            <tr>
              <th>Holding</th>
              <th>Owner</th>
              <th>Theme</th>
              <th className="numeric">Value A$</th>
              <th className="numeric">Total P/L</th>
              <th>Fundamental status</th>
              <th>Core inputs</th>
              <th>Risk notes</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((holding) => {
              const saved = fundamentalsBySymbol.get(holding.symbol.toUpperCase());
              const status = saved ? { label: "Research saved", tone: "good" as const } : scoreStatus(holding);
              const score = averageScore(saved);
              return (
                <tr
                  key={holding.id}
                  className={styles.clickableRow}
                  onClick={() => onSelect(holding)}
                >
                  <td>
                    {/* The row is the click target, but the symbol carries the accessible name so the
                        workpage is reachable by keyboard without making every cell focusable. */}
                    <button
                      type="button"
                      className={styles.rowOpen}
                      onClick={(event) => { event.stopPropagation(); onSelect(holding); }}
                    >
                      {holding.symbol}
                    </button>
                    <span>{holding.name}</span>
                    <small>{holding.broker ?? "Unknown broker"} · {holding.priceCurrency ?? "AUD"}</small>
                  </td>
                  <td>{holding.ownerType === "SMSF" ? "SMSF" : "Personal"}</td>
                  <td><SectorTag label={holding.sector} color={SECTOR_COLORS[holding.sector]} /></td>
                  <td className="numeric">{money(holding.marketValueAud)}<small>{holding.marketValueAud && totalMinerValue ? `${(holding.marketValueAud / totalMinerValue * 100).toFixed(1)}% miner book` : "0.0% miner book"}</small></td>
                  <td className={`numeric ${holding.pnlAud >= 0 ? "positive" : "negative"}`}>{money(holding.pnlAud)}<small>{percent(holding.pnlPercent)}</small></td>
                  <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge><small>{score == null ? "No risk score" : `${score.toFixed(1)} / 5 avg score`}</small></td>
                  <td>
                    <span>AISC {numberOrDash(saved?.aiscUsdPerOz, " USD/oz")} · Resource {numberOrDash(saved?.resourceMoz, " Moz")}</span>
                    <small>Cash {moneyOrDash(saved?.cashAud)} · Debt {moneyOrDash(saved?.debtAud)} · NPV {moneyOrDash(saved?.npvAud)}</small>
                  </td>
                  <td>
                    <span>{saved?.jurisdiction ?? "Jurisdiction needed"}{saved?.primaryMetal ? ` · ${saved.primaryMetal}` : ""}</span>
                    <small>{saved?.notes ?? (saved?.asOfDate ? `As of ${dateOrDash(saved.asOfDate)}` : "Production, AISC, resource oz and source date needed.")}</small>
                    {saved?.sourceUrl ? <a className={styles.sourceLink} onClick={(event) => event.stopPropagation()} href={saved.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && !holdings.length ? <p className="empty">No miner holdings are available for this workbench.</p> : null}
    </Card>
  );
}

type ResearchIdeasTableProps = {
  ideas: MinerFundamentals[];
  loading: boolean;
  onSelect: (idea: MinerFundamentals) => void;
};

export function ResearchIdeasTable({ ideas, loading, onSelect }: ResearchIdeasTableProps) {
  return (
    <Card className={styles.tableCard}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Saved fundamentals</p>
          <h2 className="cardTitle">Saved fundamentals not currently held</h2>
        </div>
        <StatusBadge tone={ideas.length ? "good" : "warning"}>
          {loading ? "Loading" : `${ideas.length} records`}
        </StatusBadge>
      </div>

      <div className="holdingsTableWrap">
        <table className={`holdingsTable ${styles.table}`}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Theme</th>
              <th>Stage</th>
              <th>Core inputs</th>
              <th>Risk score</th>
              <th>Source notes</th>
            </tr>
          </thead>
          <tbody>
            {ideas.map((item) => {
              const score = averageScore(item);
              return (
                <tr
                  key={item.symbol}
                  className={styles.clickableRow}
                  onClick={() => onSelect(item)}
                  title="Edit saved fundamentals"
                >
                  <td>
                    <button
                      type="button"
                      className={styles.rowOpen}
                      onClick={(event) => { event.stopPropagation(); onSelect(item); }}
                    >
                      {item.symbol}
                    </button>
                    <span>{item.name ?? "Research candidate"}</span>
                  </td>
                  <td>{item.primaryMetal ?? "Metal needed"}</td>
                  <td>
                    <span>{item.projectStage ?? "Stage needed"}</span>
                    <small>{item.jurisdiction ?? "Jurisdiction needed"}</small>
                  </td>
                  <td>
                    <span>AISC {numberOrDash(item.aiscUsdPerOz, " USD/oz")} · Resource {numberOrDash(item.resourceMoz, " Moz")}</span>
                    <small>Reserve {numberOrDash(item.reserveMoz, " Moz")} · NPV {moneyOrDash(item.npvAud)}</small>
                  </td>
                  <td>
                    <StatusBadge tone={score == null ? "warning" : "good"}>{score == null ? "No score" : `${score.toFixed(1)} / 5`}</StatusBadge>
                  </td>
                  <td>
                    <span>{item.notes ?? "Source notes needed."}</span>
                    <small>{item.asOfDate ? `As of ${dateOrDash(item.asOfDate)}` : "No source date"}</small>
                    {item.sourceUrl ? <a className={styles.sourceLink} onClick={(event) => event.stopPropagation()} href={item.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && !ideas.length ? <p className="empty">No saved fundamentals outside current holdings yet.</p> : null}
    </Card>
  );
}
