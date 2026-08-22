import type { FormEvent } from "react";
import type { FundamentalResearchDraft } from "@/lib/storage";
import { Card, StatusBadge } from "@/southernstar/components";
import { RESEARCH_FORM_ID, dateOrDash, type ResearchAiProvider, type ResearchFormState } from "./model";
import styles from "./FundamentalsRisk.module.css";

type ResearchIntakeFormProps = {
  form: ResearchFormState;
  status: { saving: boolean; finding: boolean; message: string; error: string };
  aiProvider: ResearchAiProvider;
  drafts: FundamentalResearchDraft[];
  activeDraftId: string;
  busyDraftId: string;
  draftError: string;
  onChange: <K extends keyof ResearchFormState>(field: K, value: ResearchFormState[K]) => void;
  onAiProviderChange: (provider: ResearchAiProvider) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAutoFind: () => void;
  onReviewDraft: (draft: FundamentalResearchDraft) => void;
  onRejectDraft: (draft: FundamentalResearchDraft) => void;
  onClear: () => void;
};

function confidenceLabel(value: number | null) {
  if (value == null) return "No confidence";
  return Math.round(value * 100) + "% confidence";
}

export function ResearchIntakeForm({ form, status, aiProvider, drafts, activeDraftId, busyDraftId, draftError, onChange, onAiProviderChange, onSubmit, onAutoFind, onReviewDraft, onRejectDraft, onClear }: ResearchIntakeFormProps) {
  const hasSymbol = form.symbol.trim().length > 0;
  return (
    <Card id={RESEARCH_FORM_ID} className={styles.researchFormCard}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Research intake</p>
          <h2 className="cardTitle">Add or research a miner idea</h2>
          <p className="cardIntro">Enter facts manually, or enter a ticker and let SouthernStar look for official filings before you review and save.</p>
        </div>
        <StatusBadge tone={status.message ? "good" : drafts.length ? "warning" : "warning"}>{status.finding ? "Finding facts" : activeDraftId ? "Draft loaded" : "Review source"}</StatusBadge>
      </div>

      {drafts.length ? (
        <div className={styles.inlineDrafts}>
          <div>
            <strong>{drafts.length} pending factual {drafts.length === 1 ? "draft" : "drafts"}</strong>
            <span>Load one into this form, check it, then save or reject.</span>
          </div>
          <div className={styles.inlineDraftList}>
            {drafts.map((draft) => (
              <div key={draft.id} className={draft.id === activeDraftId ? styles.inlineDraftActive : ""}>
                <span><b>{draft.symbol}</b> {draft.sourceTitle || "Source required"} · {confidenceLabel(draft.confidence)} · {dateOrDash(draft.createdAt)}</span>
                <button type="button" onClick={() => onReviewDraft(draft)} disabled={busyDraftId === draft.id}>Review</button>
                <button type="button" onClick={() => onRejectDraft(draft)} disabled={busyDraftId === draft.id}>{busyDraftId === draft.id ? "Rejecting" : "Reject"}</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form className={styles.researchForm} onSubmit={onSubmit}>
        <label><span>Symbol</span><input value={form.symbol} onChange={(event) => onChange("symbol", event.target.value.toUpperCase())} placeholder="PAAS" required /></label>
        <label><span>Name</span><input value={form.name} onChange={(event) => onChange("name", event.target.value)} placeholder="Pan American Silver" /></label>
        <label><span>Metal / theme</span><input value={form.primaryMetal} onChange={(event) => onChange("primaryMetal", event.target.value)} placeholder="Silver" /></label>
        <label><span>Jurisdiction</span><input value={form.jurisdiction} onChange={(event) => onChange("jurisdiction", event.target.value)} placeholder="Mexico, Peru, Canada" /></label>
        <label><span>Stage</span><input value={form.projectStage} onChange={(event) => onChange("projectStage", event.target.value)} placeholder="Producer" /></label>
        <label><span>As of</span><input type="date" value={form.asOfDate} onChange={(event) => onChange("asOfDate", event.target.value)} /></label>
        <label><span>Production oz</span><input inputMode="decimal" value={form.productionOz} onChange={(event) => onChange("productionOz", event.target.value)} placeholder="12000000" /></label>
        <label><span>AISC USD/oz</span><input inputMode="decimal" value={form.aiscUsdPerOz} onChange={(event) => onChange("aiscUsdPerOz", event.target.value)} placeholder="18.50" /></label>
        <label><span>Resource Moz</span><input inputMode="decimal" value={form.resourceMoz} onChange={(event) => onChange("resourceMoz", event.target.value)} placeholder="100" /></label>
        <label><span>Reserve Moz</span><input inputMode="decimal" value={form.reserveMoz} onChange={(event) => onChange("reserveMoz", event.target.value)} placeholder="50" /></label>
        <label><span>Cash A$</span><input inputMode="decimal" value={form.cashAud} onChange={(event) => onChange("cashAud", event.target.value)} /></label>
        <label><span>Debt A$</span><input inputMode="decimal" value={form.debtAud} onChange={(event) => onChange("debtAud", event.target.value)} /></label>
        <label><span>Market cap A$</span><input inputMode="decimal" value={form.marketCapAud} onChange={(event) => onChange("marketCapAud", event.target.value)} placeholder="900000000" /></label>
        <label><span>Project NPV A$</span><input inputMode="decimal" value={form.npvAud} onChange={(event) => onChange("npvAud", event.target.value)} placeholder="1400000000" /></label>
        <label><span>Capex A$</span><input inputMode="decimal" value={form.capexAud} onChange={(event) => onChange("capexAud", event.target.value)} placeholder="300000000" /></label>
        <label><span>IRR %</span><input inputMode="decimal" value={form.irrPercent} onChange={(event) => onChange("irrPercent", event.target.value)} placeholder="32" /></label>
        <label><span>Jurisdiction score</span><input inputMode="numeric" min="0" max="5" value={form.jurisdictionScore} onChange={(event) => onChange("jurisdictionScore", event.target.value)} placeholder="0-5" /></label>
        <label><span>Balance score</span><input inputMode="numeric" min="0" max="5" value={form.balanceSheetScore} onChange={(event) => onChange("balanceSheetScore", event.target.value)} placeholder="0-5" /></label>
        <label><span>Dilution score</span><input inputMode="numeric" min="0" max="5" value={form.dilutionScore} onChange={(event) => onChange("dilutionScore", event.target.value)} placeholder="0-5" /></label>
        <label><span>Management score</span><input inputMode="numeric" min="0" max="5" value={form.managementScore} onChange={(event) => onChange("managementScore", event.target.value)} placeholder="0-5" /></label>
        <label className={styles.wide}><span>Source URL</span><input value={form.sourceUrl} onChange={(event) => onChange("sourceUrl", event.target.value)} placeholder="https://... or leave blank for auto-find" /></label>
        <label><span>Fact extractor</span><select value={aiProvider} onChange={(event) => onAiProviderChange(event.target.value as ResearchAiProvider)}><option value="none">Deterministic</option><option value="openai">ChatGPT</option><option value="anthropic">Claude</option></select></label>
        <label className={styles.wide}><span>Notes</span><textarea value={form.notes} onChange={(event) => onChange("notes", event.target.value)} rows={3} placeholder="What was sourced, what is judgement, what needs checking next." /></label>
        <div className={`buttonRow ${styles.researchActions}`}>
          <button className="primary" type="submit" disabled={status.saving || status.finding}>{status.saving ? "Saving" : activeDraftId ? "Save reviewed facts" : "Save research idea"}</button>
          <button type="button" onClick={onAutoFind} disabled={!hasSymbol || status.saving || status.finding}>{status.finding ? "Finding" : "Auto-find facts"}</button>
          <button type="button" onClick={onClear} disabled={status.saving || status.finding}>Clear</button>
        </div>
      </form>
      {status.message ? <p className={styles.message}>{status.message}</p> : null}
      {status.error ? <p className={`${styles.message} ${styles.messageError}`}>{status.error}</p> : null}
      {draftError ? <p className={`${styles.message} ${styles.messageError}`}>{draftError}</p> : null}
    </Card>
  );
}
