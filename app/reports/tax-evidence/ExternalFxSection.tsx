"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Card, Notice } from "@/southernstar/components";
import type { TaxEvidenceReport } from "@/lib/tax-evidence/report";
import styles from "./TaxEvidence.module.css";

const amount = (value: number | null) => value == null ? "Unknown" : value.toLocaleString("en-AU", { maximumFractionDigits: 8 });
type Props = { scope: "personal" | "smsf"; year: number; report: TaxEvidenceReport | null; busy: boolean; onBusyChange: (value: boolean) => void; onRecorded: () => void };

export default function ExternalFxSection({ scope, year, report, busy, onBusyChange, onRecorded }: Props) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const withdrawals = report?.transactions.filter((row) => ["CASH_ACTIVITY", "DEPOSIT", "WITHDRAWAL"].includes(row.type) && (row.amount ?? 0) < 0) ?? [];
  function selectFunding(event: ChangeEvent<HTMLSelectElement>) {
    const row = withdrawals.find((item) => item.id === event.target.value);
    const form = event.currentTarget.form;
    if (!row || !form) return;
    for (const [name, value] of Object.entries({ fromCurrency: row.currency, fromAmount: String(Math.abs(row.amount!)), month: row.date.slice(0, 7) })) {
      const input = form.elements.namedItem(name); if (input instanceof HTMLInputElement) input.value = value;
    }
  }
  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form); data.set("owner", scope === "personal" ? "PERSONAL" : "SMSF");
    onBusyChange(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/tax-evidence/external-fx", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(result.note); form.reset(); onRecorded();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to record FX evidence."); }
    finally { onBusyChange(false); }
  }
  return <Card><h2>External FX evidence</h2>
    <p>Record conversions through HiFX, XE or another provider. Amounts, exact dates, fees and supporting files can be entered for each item. Funding/payout confirmation records your review; it does not assign tax treatment.</p>
    <p>These notes explain bank movements already recorded. They do not create extra cash movements or change portfolio balances.</p>
    <div className={styles.scroll}><table><thead><tr><th>Provider / period</th><th>From</th><th>To</th><th>Rates / fees</th><th>Review / evidence</th></tr></thead><tbody>{(report?.externalFx ?? []).map((row) => <tr key={row.id}>
      <td>{row.provider}<small>{row.conversionDate ?? `${row.month} · exact date unknown`}</small>{row.reference ? <small>{row.reference}</small> : null}</td>
      <td>{amount(row.fromAmount)} {row.fromCurrency}<small>{row.fundingAccount ?? "Funding record not linked"}{row.fundingDate ? ` · ${row.fundingDate}` : ""}</small></td>
      <td>{amount(row.toAmount)} {row.toCurrency}</td>
      <td>{amount(row.amountImpliedRate)} {row.toCurrency}/{row.fromCurrency}<small>Amount-implied ratio</small><small>Quoted rate: {amount(row.quotedRate)}</small><small>Fees: {amount(row.feeAmount)} {row.feeCurrency ?? ""}</small></td>
      <td>{row.pairingStatus === "user_confirmed" ? "Pairing confirmed by user" : "Provisional pairing"}<small>{row.evidenceBasis === "provider_confirmation" ? "Provider confirmation supplied" : "User-reported amounts"}</small><small>{row.note}</small>
        <a href={`/api/tax-evidence/documents/${row.id}?scope=${scope}`}>Saved declaration</a>{row.supportingSourceIds.map((id, index) => <small key={id}><a href={`/api/tax-evidence/documents/${id}?scope=${scope}`}>Supporting evidence {index + 1}</a></small>)}</td>
    </tr>)}</tbody></table></div>
    {!(report?.externalFx?.length) ? <p>No external FX items recorded for this owner and year.</p> : null}
    <details><summary>Log an external FX item</summary><form onSubmit={record} className={styles.importForm}>
      <label>Provider<input name="provider" required maxLength={120} placeholder="HiFX / XE, or another provider" /></label>
      <label>Private provider-account label<input name="account" required maxLength={128} placeholder="A consistent account name or private alias" /></label>
      <label>Provider / payment reference (optional)<input name="reference" maxLength={200} /></label>
      <label>Recorded funding withdrawal (optional)<select name="fundingTransactionId" onChange={selectFunding}><option value="">Not linked yet</option>{withdrawals.map((row) => <option key={row.id} value={row.id}>{row.date} · {row.account} · {row.currency} {amount(row.amount)}</option>)}</select></label>
      <label>Activity month<input name="month" type="month" required defaultValue={`${year - 1}-07`} /></label>
      <label>Exact conversion date (optional)<input name="conversionDate" type="date" /></label>
      <label>From currency<input name="fromCurrency" required minLength={3} maxLength={3} placeholder="USD" /></label>
      <label>From amount<input name="fromAmount" type="number" step="any" min="0.00000001" required /></label>
      <label>To currency<input name="toCurrency" required minLength={3} maxLength={3} placeholder="AUD" /></label>
      <label>To amount / payout<input name="toAmount" type="number" step="any" min="0.00000001" required /></label>
      <label>Quoted rate (optional, to per from)<input name="quotedRate" type="number" step="any" min="0.00000001" /></label>
      <label>Provider fees (blank if unknown)<input name="feeAmount" type="number" step="any" min="0" /></label>
      <label>Fee currency (if fees supplied)<input name="feeCurrency" minLength={3} maxLength={3} /></label>
      <label>Funding and payout pairing<select name="pairingStatus"><option value="provisional">Provisional</option><option value="user_confirmed">I confirm these belong to the same transfer</option></select></label>
      <label>Amount source<select name="evidenceBasis"><option value="user_reported">User-reported amounts</option><option value="provider_confirmation">Provider confirmation supplied</option></select></label>
      <label>Supporting files (optional)<input name="support" type="file" multiple accept=".pdf,.txt,.csv,.xml,.json,.png,.jpg,.jpeg" /></label>
      <label className={styles.wide}>Evidence / review note<textarea name="note" required maxLength={4000} placeholder="What the source shows, who confirmed the pairing, and what remains unknown" /></label>
      <p>Leave an unknown exact date, quoted rate or fee blank. Provider-confirmation entries require a supporting file and exact date. Files and your declaration are retained for audit; the evidence ZIP includes this schedule.</p>
      <div className={styles.toolbar}><button type="submit" disabled={busy}>Record FX evidence</button></div>
    </form></details>
    {message ? <p role="status">{message}</p> : null}{error ? <Notice>{error}</Notice> : null}
  </Card>;
}
