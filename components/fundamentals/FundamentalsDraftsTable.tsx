import type { FundamentalResearchDraft } from "@/lib/storage";
import { Card, StatusBadge } from "@/southernstar/components";
import { dateOrDash } from "./model";
import styles from "./FundamentalsRisk.module.css";

type Props = {
  drafts: FundamentalResearchDraft[];
  loading: boolean;
  busyId: string;
  error: string;
  onAccept: (draft: FundamentalResearchDraft) => void;
  onReject: (draft: FundamentalResearchDraft) => void;
};

function confidenceLabel(value: number | null) {
  if (value == null) return "No confidence";
  return Math.round(value * 100) + "% confidence";
}

export function FundamentalsDraftsTable({ drafts, loading, busyId, error, onAccept, onReject }: Props) {
  return (
    <Card className={styles.tableCard}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Research inbox</p>
          <h2 className="cardTitle">Pending factual drafts</h2>
          <p className="cardIntro">AI or external research can propose sourced facts here. Nothing writes to approved fundamentals until accepted.</p>
        </div>
        <StatusBadge tone={drafts.length ? "warning" : "good"}>
          {loading ? "Loading" : drafts.length ? drafts.length + " pending" : "Clear"}
        </StatusBadge>
      </div>
      {error ? <p className={styles.messageError}>{error}</p> : null}
      {drafts.length ? (
        <div className="tableScroll">
          <table className={`dataTable ${styles.table}`}>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Proposed facts</th>
                <th>Source</th>
                <th>Extracted by</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.id}>
                  <td><strong>{draft.symbol}</strong><small>{draft.name ?? "Unnamed"}</small></td>
                  <td>
                    <strong>{[draft.primaryMetal, draft.projectStage, draft.jurisdiction].filter(Boolean).join(" · ") || "No descriptor"}</strong>
                    <small>{draft.sourceExcerpt || draft.notes || "Review the source before accepting."}</small>
                  </td>
                  <td>
                    <strong>{draft.sourceTitle || "Source required"}</strong>
                    <small>{dateOrDash(draft.sourceDate ?? draft.asOfDate)} · {confidenceLabel(draft.confidence)}</small>
                    {draft.sourceUrl ? <a className={styles.sourceLink} href={draft.sourceUrl} target="_blank" rel="noreferrer">Open source</a> : null}
                  </td>
                  <td><span>{draft.extractor}</span><small>{dateOrDash(draft.createdAt)}</small></td>
                  <td>
                    <div className={styles.draftActions}>
                      <button type="button" className="primary" disabled={busyId === draft.id} onClick={() => onAccept(draft)}>{busyId === draft.id ? "Reviewing" : "Accept"}</button>
                      <button type="button" disabled={busyId === draft.id} onClick={() => onReject(draft)}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading ? <p className="empty">No pending research drafts.</p> : null}
    </Card>
  );
}
