"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Card, Notice } from "@/southernstar/components";
import type { TaxEvidenceReport } from "@/lib/tax-evidence/report";
import styles from "./TaxEvidence.module.css";

const amount = (value: number | null) => value == null ? "Unknown" : value.toLocaleString("en-AU", { maximumFractionDigits: 8 });
type Props = { scope: "personal" | "smsf"; year: number; report: TaxEvidenceReport | null; busy: boolean; onBusyChange: (value: boolean) => void; onRecorded: () => void };

function ReceiptReview({ row, scope, report, busy, onBusyChange, onRecorded }: Omit<Props, "year"> & { row: TaxEvidenceReport["externalFx"][number] }) {
  const [message, setMessage] = useState("");
  const receipts = report?.transactions.filter((credit) => ["CASH_ACTIVITY", "DEPOSIT", "WITHDRAWAL"].includes(credit.type)
    && credit.currency === row.toCurrency && credit.amount != null && credit.amount > 0 && Math.abs(credit.amount - row.toAmount) <= 0.005) ?? [];
  const label = `${row.provider} ${row.month}`;
  async function reconcile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const undo = Boolean(row.receipt);
    onBusyChange(true); setMessage("");
    try {
      const response = await fetch("/api/tax-evidence/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        ownerType: scope === "personal" ? "PERSONAL" : "SMSF", outgoingId: row.fundingTransactionId,
        incomingId: undo ? row.receipt!.transactionId : data.get("incoming"), externalFxId: row.id, action: undo ? "unmatch" : "match", note: data.get("note"),
      }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      form.reset(); onRecorded();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to record the receipt review."); }
    finally { onBusyChange(false); }
  }
  return <details><summary>{row.receipt ? "Review or undo receipt link" : "Reconcile receiving bank credit"}</summary>
    {!row.fundingTransactionId ? <p>Link a recorded funding withdrawal before reconciling its bank payout.</p> : <form onSubmit={reconcile} className={styles.importForm}>
      {!row.receipt ? <label>Receiving bank credit for {label}<select name="incoming" required defaultValue=""><option value="">Choose a bank credit</option>{receipts.map((credit) => <option key={credit.id} value={credit.id}>{credit.date} · {credit.account} · {credit.currency} {amount(credit.amount)}</option>)}</select></label> : null}
      <label className={styles.wide}>Receipt review note for {label}<textarea name="note" required maxLength={2000} placeholder="Compare payer, amount, account, dates and source; identify user-transcribed evidence." /></label>
      <p>A bank receipt date is not an FX execution date. This link creates no new cash movements and leaves the original declaration intact.</p>
      <button type="submit" disabled={busy || (!row.receipt && !receipts.length)}>{row.receipt ? `Undo receipt link for ${label}` : `Confirm bank receipt for ${label}`}</button>
    </form>}{message ? <Notice>{message}</Notice> : null}
  </details>;
}

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
    <div className={styles.fxItems}>{(report?.externalFx ?? []).map((row) => <article key={row.id} className={styles.fxItem}>
      <h3>{row.provider} · {row.month}{row.reference ? ` · ${row.reference}` : ""}</h3>
      <dl className={styles.fxFacts}>
        <div><dt>Funding</dt><dd>{amount(row.fromAmount)} {row.fromCurrency}<small>{row.fundingAccount ?? "Funding record not linked"}{row.fundingDate ? ` · ${row.fundingDate}` : ""}</small></dd></div>
        <div><dt>Reported payout</dt><dd>{amount(row.toAmount)} {row.toCurrency}<small>{row.pairingStatus === "user_confirmed" ? "Funding/payout pairing confirmed by user" : "Funding/payout pairing provisional"}</small></dd></div>
        <div><dt>Receiving bank</dt><dd>{row.receipt ? <><strong>Bank receipt matched</strong><small>{row.receipt.account}</small><small>Received {row.receipt.date} · {amount(row.receipt.amount)} {row.receipt.currency}</small><small>{row.receipt.sourceBasis}</small>{row.receipt.sourceId ? <a href={`/api/tax-evidence/documents/${row.receipt.sourceId}?scope=${scope}`}>Receipt source</a> : null}</> : "Not reconciled to a bank credit"}</dd></div>
        <div><dt>Conversion details</dt><dd>{amount(row.amountImpliedRate)} {row.toCurrency}/{row.fromCurrency}<small>Amount-implied ratio; quoted rate: {amount(row.quotedRate)}</small><small>Conversion date: {row.conversionDate ?? "Unknown"}</small><small>Provider fees: {amount(row.feeAmount)} {row.feeCurrency ?? ""}</small></dd></div>
      </dl>
      <details><summary>Declaration and supporting evidence</summary><p>{row.evidenceBasis === "provider_confirmation" ? "Provider confirmation supplied" : "User-reported amounts"}. {row.note}</p>
        <p><a href={`/api/tax-evidence/documents/${row.id}?scope=${scope}`}>Saved declaration</a>{row.supportingSourceIds.map((id, index) => <span key={id}> · <a href={`/api/tax-evidence/documents/${id}?scope=${scope}`}>Supporting evidence {index + 1}</a></span>)}</p>
        {row.receipt ? <p>Receipt review by {row.receipt.author}: {row.receipt.note}</p> : null}
      </details>
      <ReceiptReview row={row} scope={scope} report={report} busy={busy} onBusyChange={onBusyChange} onRecorded={onRecorded} />
    </article>)}</div>
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
