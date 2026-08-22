import type { FormEvent } from "react";
import { Card, StatusBadge } from "@/southernstar/components";
import type { ResearchRequestState } from "./model";
import styles from "./FundamentalsRisk.module.css";

type Props = {
  form: ResearchRequestState;
  status: { loading: boolean; message: string; error: string };
  onChange: <K extends keyof ResearchRequestState>(field: K, value: ResearchRequestState[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function FundamentalsResearchRequest({ form, status, onChange, onSubmit }: Props) {
  return (
    <Card className={styles.researchRequestCard}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Factual research request</p>
          <h2 className="cardTitle">Create a draft from a ticker</h2>
          <p className="cardIntro">Add a ticker and, ideally, a filing or company announcement URL. SouthernStar extracts only obvious facts and puts the result in the review inbox.</p>
        </div>
        <StatusBadge tone={status.message ? "good" : "warning"}>{status.loading ? "Drafting" : "Review first"}</StatusBadge>
      </div>
      <form className={styles.researchRequestForm} onSubmit={onSubmit}>
        <label>
          <span>Ticker</span>
          <input value={form.symbol} onChange={(event) => onChange("symbol", event.target.value.toUpperCase())} placeholder="CMM" required />
        </label>
        <label>
          <span>Name</span>
          <input value={form.name} onChange={(event) => onChange("name", event.target.value)} placeholder="Optional" />
        </label>
        <label className={styles.researchRequestSource}>
          <span>Source URL</span>
          <input value={form.sourceUrl} onChange={(event) => onChange("sourceUrl", event.target.value)} placeholder="https:// company report, ASX announcement, filing..." />
        </label>
        <button className="primary" type="submit" disabled={status.loading}>{status.loading ? "Creating draft" : "Create factual draft"}</button>
      </form>
      {status.message ? <p className={styles.message}>{status.message}</p> : null}
      {status.error ? <p className={`${styles.message} ${styles.messageError}`}>{status.error}</p> : null}
    </Card>
  );
}
