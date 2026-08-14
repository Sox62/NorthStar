import type { FormEvent } from "react";
import { Card, StatusBadge } from "@/northstar/components";
import type { ResearchFormState } from "./model";
import styles from "./FundamentalsRisk.module.css";

type ResearchIntakeFormProps = {
  form: ResearchFormState;
  status: { saving: boolean; message: string; error: string };
  onChange: <K extends keyof ResearchFormState>(field: K, value: ResearchFormState[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
};

export function ResearchIntakeForm({ form, status, onChange, onSubmit, onClear }: ResearchIntakeFormProps) {
  return (
    <Card className={styles.researchFormCard}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Research intake</p>
          <h2 className="cardTitle">Add a miner idea</h2>
        </div>
        <StatusBadge tone={status.message ? "good" : "warning"}>{status.saving ? "Saving" : "Manual source"}</StatusBadge>
      </div>
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
        <label><span>Jurisdiction score</span><input inputMode="numeric" min="0" max="5" value={form.jurisdictionScore} onChange={(event) => onChange("jurisdictionScore", event.target.value)} placeholder="0-5" /></label>
        <label><span>Balance score</span><input inputMode="numeric" min="0" max="5" value={form.balanceSheetScore} onChange={(event) => onChange("balanceSheetScore", event.target.value)} placeholder="0-5" /></label>
        <label><span>Dilution score</span><input inputMode="numeric" min="0" max="5" value={form.dilutionScore} onChange={(event) => onChange("dilutionScore", event.target.value)} placeholder="0-5" /></label>
        <label><span>Management score</span><input inputMode="numeric" min="0" max="5" value={form.managementScore} onChange={(event) => onChange("managementScore", event.target.value)} placeholder="0-5" /></label>
        <label className={styles.wide}><span>Source URL</span><input value={form.sourceUrl} onChange={(event) => onChange("sourceUrl", event.target.value)} placeholder="https://..." /></label>
        <label className={styles.wide}><span>Notes</span><textarea value={form.notes} onChange={(event) => onChange("notes", event.target.value)} rows={3} placeholder="What was sourced, what is judgement, what needs checking next." /></label>
        <div className={`buttonRow ${styles.researchActions}`}>
          <button className="primary" type="submit" disabled={status.saving}>{status.saving ? "Saving" : "Save research idea"}</button>
          <button type="button" onClick={onClear} disabled={status.saving}>Clear</button>
        </div>
      </form>
      {status.message ? <p className={styles.message}>{status.message}</p> : null}
      {status.error ? <p className={`${styles.message} ${styles.messageError}`}>{status.error}</p> : null}
    </Card>
  );
}
