"use client";

import { useMemo, useState } from "react";
import type { MinerFundamentals } from "@/lib/storage";
import { Overlay } from "@/northstar/components/Overlay";
import { SectorTag, StatusBadge } from "@/northstar/components";
import { SECTOR_COLORS, type Holding } from "@/northstar/types";
import { averageScore, money, percent } from "./model";
import { failureModes, fundamentalFields, riskRows, valuationRows } from "./detail-model";
import styles from "./FundamentalsDetail.module.css";

const DEFAULT_PROBABILITY = 0.6;
const DEFAULT_HAIRCUT = 35;

export function FundamentalsDetail({ holding, fundamentals, onClose, onEdit }: {
  holding: Holding;
  fundamentals: MinerFundamentals | undefined;
  onClose: () => void;
  onEdit: (holding: Holding) => void;
}) {
  const [probability, setProbability] = useState(DEFAULT_PROBABILITY);
  const [haircut, setHaircut] = useState(DEFAULT_HAIRCUT);

  const fields = useMemo(() => fundamentalFields(holding, fundamentals), [holding, fundamentals]);
  const risks = useMemo(() => riskRows(fundamentals), [fundamentals]);
  const valuation = useMemo(
    () => valuationRows({ fundamentals, probability, haircutPercent: haircut }),
    [fundamentals, probability, haircut],
  );
  const modes = useMemo(() => failureModes(fundamentals), [fundamentals]);
  const score = averageScore(fundamentals);

  const descriptor = [
    fundamentals?.primaryMetal,
    fundamentals?.jurisdiction,
    holding.exchange,
    holding.priceCurrency,
  ].filter(Boolean).join(" · ");

  return (
    <Overlay
      eyebrow="Fundamentals and risk"
      title={`${holding.symbol} — ${holding.name}`}
      subtitle={descriptor || "No fundamentals recorded yet"}
      actions={
        <button className="nsReportButton" type="button" onClick={() => onEdit(holding)}>
          {fundamentals ? "Edit fundamentals" : "Add fundamentals"}
        </button>
      }
      onClose={onClose}
    >
      <div className={styles.detail}>
        <div className={styles.topRow}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <p className={styles.cardTitle}>Company and position</p>
                <p className={styles.cardIntro}>
                  {money(holding.marketValueAud)} held · {percent(holding.pnlPercent)} total P/L
                </p>
              </div>
              <div className={styles.badges}>
                <SectorTag label={holding.sector} color={SECTOR_COLORS[holding.sector]} />
                <StatusBadge tone={fundamentals ? "good" : "warning"}>
                  {fundamentals ? "Research saved" : "Awaiting fundamentals"}
                </StatusBadge>
                {score != null ? <StatusBadge tone="good">{`Score ${score.toFixed(1)} / 5`}</StatusBadge> : null}
              </div>
            </div>

            <p className={styles.thesis}>
              {fundamentals?.notes?.trim()
                || "No thesis recorded. Add notes from the research intake form to keep the reasoning beside the numbers."}
            </p>

            <div className={styles.fieldGrid}>
              {fields.map((field) => (
                <div className={styles.fieldRow} key={field.key}>
                  <span>{field.label}</span>
                  <span className={styles.fieldValue}>{field.value}</span>
                </div>
              ))}
            </div>

            {fundamentals?.sourceUrl ? (
              <p className={styles.source}>
                Source: <a href={fundamentals.sourceUrl} target="_blank" rel="noreferrer">{fundamentals.sourceUrl}</a>
              </p>
            ) : null}
          </section>

          <section className={styles.card}>
            <p className={styles.cardTitle}>Risk and jurisdiction</p>
            <p className={styles.cardIntro}>Excellent asset and high risk are not a contradiction</p>
            <div className={styles.riskRows}>
              {risks.map((risk) => (
                <div className={styles.riskRow} key={risk.key}>
                  <div className={styles.riskHead}>
                    <p className={styles.riskLabel}>{risk.label}</p>
                    <StatusBadge tone={risk.tone}>{risk.level}</StatusBadge>
                  </div>
                  {risk.score == null ? null : (
                    <div className={styles.riskMeter} role="img" aria-label={`${risk.label}: ${risk.level}`}>
                      <span className={`${styles.riskFill} ${styles[risk.tone]}`} style={{ width: `${risk.score * 100}%` }} />
                    </div>
                  )}
                  <p className={styles.riskNote}>{risk.note}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className={styles.bottomRow}>
          <section className={styles.card}>
            <p className={styles.cardTitle}>Do shareholders receive it?</p>
            <p className={styles.cardIntro}>A project NPV is only worth what survives execution and a haircut.</p>
            <div className={styles.inputs}>
              <label>
                <span>Shareholder economics probability — 0 to 1</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={probability}
                  onChange={(event) => setProbability(Number(event.target.value))}
                />
              </label>
              <label>
                <span>Valuation haircut — percent</span>
                <input
                  type="number"
                  step="5"
                  min="0"
                  max="100"
                  value={haircut}
                  onChange={(event) => setHaircut(Number(event.target.value))}
                />
              </label>
            </div>
            <div className={styles.valuationRows}>
              {valuation.map((row) => (
                <div className={`${styles.valuationRow}${row.emphasis ? ` ${styles.isEmphasis}` : ""}`} key={row.key}>
                  <span>{row.label}</span>
                  <span className={row.tone ? styles[row.tone] : undefined}>{row.value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.card}>
            <p className={styles.cardTitle}>Catalyst path</p>
            <p className={styles.empty}>
              Catalysts are not part of the fundamentals record yet, so nothing is shown rather than guessed.
              Dated milestones would sit here once the model carries them.
            </p>
          </section>

          <section className={styles.card}>
            <p className={styles.cardTitle}>Key failure modes</p>
            {modes.length ? (
              <div className={styles.modes}>
                {modes.map((mode) => (
                  <div className={styles.mode} key={mode}>
                    <span className={styles.dot} aria-hidden="true" />
                    <p>{mode}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>
                {fundamentals
                  ? "No failure modes are flagged by the recorded scores and balance sheet."
                  : "Save fundamentals for this holding to surface failure modes."}
              </p>
            )}
            <p className={styles.footnote}>
              Fundamentals inform position state; they do not generate an order.
            </p>
          </section>
        </div>
      </div>
    </Overlay>
  );
}
