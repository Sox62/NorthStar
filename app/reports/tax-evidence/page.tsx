"use client";

import { useEffect, useState, type FormEvent } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, Notice, SummaryGrid } from "@/southernstar/components";
import type { TaxEvidenceReport } from "@/lib/tax-evidence/report";
import type { IbkrFlexSyncResult } from "@/lib/sync/ibkr-flex";
import ExternalFxSection from "./ExternalFxSection";
import styles from "./TaxEvidence.module.css";

function currentFinancialYear() {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "numeric" }).formatToParts(new Date());
  return Number(parts.find((part) => part.type === "year")?.value) + (Number(parts.find((part) => part.type === "month")?.value) >= 7 ? 1 : 0);
}
const amount = (value: number | null | undefined) => {
  if (value == null) return "Missing evidence";
  const formatted = value.toLocaleString("en-AU", { maximumFractionDigits: 6 });
  return formatted === "-0" ? "0" : formatted;
};

export default function TaxEvidencePage() {
  const [scope, setScope] = useState<"personal" | "smsf">("personal");
  const [year, setYear] = useState(currentFinancialYear);
  const [report, setReport] = useState<TaxEvidenceReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [system, setSystem] = useState("Westpac");
  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [flexResult, setFlexResult] = useState<IbkrFlexSyncResult | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [outgoing, setOutgoing] = useState("");
  const [incoming, setIncoming] = useState("");
  const query = `scope=${scope}&year=${year}`;

  useEffect(() => { setFlexResult(null); setImportResult(null); }, [scope]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setReport(null); setError("");
    fetch(`/api/reports/tax-evidence?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setReport(data); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    setPreviewKey(""); setOutgoing(""); setIncoming("");
    return () => controller.abort();
  }, [query, revision]);

  async function refreshIbkrEvidence() {
    setBusy(true); setSyncing(true); setError(""); setFlexResult(null);
    try {
      const response = await fetch(`/api/sync/ibkr?owner=${scope === "personal" ? "PERSONAL" : "SMSF"}&mode=evidence`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setFlexResult(result); setRevision((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "IBKR evidence refresh failed."); }
    finally { setBusy(false); setSyncing(false); }
  }

  async function importFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const form = new FormData(event.currentTarget);
    form.set("file", file); form.set("owner", scope === "personal" ? "PERSONAL" : "SMSF"); form.set("system", system);
    const key = JSON.stringify([...form.entries()].map(([key, value]) => [key, value instanceof File ? `${value.name}:${value.size}:${value.lastModified}` : value]));
    const commit = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "commit";
    if (commit && key !== previewKey) { setError("Preview this file and its current settings before importing."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/tax-evidence/import?commit=${commit ? 1 : 0}`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setImportResult(result); setPreviewKey(commit ? "" : key);
      if (commit) setRevision((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Import failed."); }
    finally { setBusy(false); }
  }

  async function review(outgoingId: string, incomingId: string, action: "match" | "unmatch") {
    if (!reviewNote.trim()) { setError("Add a review note identifying the source evidence and any fees or timing differences."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/tax-evidence/reviews", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerType: scope === "personal" ? "PERSONAL" : "SMSF", outgoingId, incomingId, action, note: reviewNote }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setReviewNote(""); setRevision((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Review failed."); }
    finally { setBusy(false); }
  }

  const cashRows = report?.transactions.filter((row) => ["CASH_ACTIVITY", "DEPOSIT", "WITHDRAWAL"].includes(row.type)) ?? [];
  return <main className="shell">
    <PageHeader title="Tax evidence" description="Trace currency conversions, cash movements and supporting statements for your accountant." />
    <Card>
      <div className={styles.toolbar}>
        <label>Legal owner<select value={scope} disabled={busy} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="personal">Personal</option><option value="smsf">SMSF</option></select></label>
        <label>Financial year ending<select value={year} disabled={busy} onChange={(event) => setYear(Number(event.target.value))}>{Array.from({ length: 8 }, (_, index) => currentFinancialYear() - index).map((item) => <option value={item} key={item}>FY{item} · 1 Jul {item - 1} – 30 Jun {item}</option>)}</select></label>
        <a className="button" href="/reports">All reports</a>
        {report && !loading ? <><a className="button" href={`/api/reports/tax-evidence?${query}&format=csv`}>Transactions CSV</a><a className="button primary" href={`/api/reports/tax-evidence?${query}&format=zip`}>Download evidence ZIP</a></> : null}
      </div>
      <p className={styles.declaration}>Transaction evidence only; Australian CGT and Division 775 forex tax treatment to be determined by the accountant.</p>
      <p>Year selection uses the source calendar date. Original timestamps and available timezones are retained for accountant review of year-end cutoffs.</p>
      <p>Cash flows are not income totals. Transfer matches do not assign tax treatment. The ZIP includes original, unredacted documents for the selected owner.</p>
    </Card>
    {error ? <Notice>{error}</Notice> : null}
    {loading ? <p role="status">Loading evidence…</p> : null}
    <Card><h2>IBKR Flex connection</h2><p>FX trades and cash activity are collected directly through the configured Flex API for {scope === "personal" ? "Personal" : "SMSF"}. Regular IBKR sync retains this evidence automatically. No IBKR file upload is needed.</p>
      <p>Refresh records the returned transactions and original response without refreshing current portfolio positions or cash balances. The configured Flex query controls the reporting period; the financial-year selector filters the saved evidence.</p>
      <p>The Activity query needs Trades including currency trades, Cash Transactions and per-currency Cash Report for the required dates. Westpac statements can be added later to reconcile the bank side; they do not block recording IBKR activity.</p>
      <button type="button" disabled={busy} onClick={refreshIbkrEvidence}>{syncing ? "Fetching IBKR evidence…" : "Refresh IBKR evidence"}</button>
      {flexResult ? <div role="status"><p>Flex response recorded for {flexResult.statementFrom} – {flexResult.statementTo}: {flexResult.flexFxTransactions} FX conversions, {flexResult.flexCashTransactions} cash movements and {flexResult.flexTrades} security trades.</p><p>{flexResult.imported} new records; {flexResult.duplicates} existing IDs skipped.</p>{flexResult.conflicts?.length ? <Notice>{flexResult.conflicts.length} source amendments need review; stored transactions were retained.</Notice> : null}</div> : null}
    </Card>
    <ExternalFxSection key={`${scope}:${year}`} scope={scope} year={year} report={report} busy={busy} onBusyChange={setBusy} onRecorded={() => setRevision((value) => value + 1)} />
    {report ? <>
      <Card><SummaryGrid entries={[["Transactions", report.transactions.length], ["FX conversions", report.conversions.length], ["Same-currency transfers", report.transfers.filter((row) => row.status === "confirmed").length], ["FX receipts matched", report.externalFx.filter((row) => row.receipt).length], ["Exceptions", report.exceptions.length], ["Source documents", report.sources.length]]} /></Card>
      <Card><h2>Currency activity</h2><p>Gross recorded flows by currency, including inter-account movements. No currencies are combined into an assumed AUD total.</p><div className={styles.scroll}><table><thead><tr><th>Currency</th><th>Cash receipts</th><th>Cash payments</th><th>Converted in</th><th>Converted out</th><th>Fees</th></tr></thead><tbody>{report.currencyTotals.map((row) => <tr key={row.currency}><td>{row.currency}</td><td>{amount(row.cashReceipts)}</td><td>{amount(row.cashPayments)}</td><td>{amount(row.convertedIn)}</td><td>{amount(row.convertedOut)}</td><td>{amount(row.fees)}</td></tr>)}</tbody></table></div></Card>
      <Card><h2>FX conversions</h2><div className={styles.scroll}><table><thead><tr><th>Date / account</th><th>From</th><th>To</th><th>Execution rate</th><th>Fee</th><th>Evidence</th></tr></thead><tbody>{report.conversions.map((row) => <tr key={row.id}><td>{row.date}<br />{row.account}</td><td>{amount(row.fromAmount)} {row.fromCurrency}</td><td>{amount(row.toAmount)} {row.toCurrency}</td><td>{amount(row.rate)} {row.toCurrency}/{row.fromCurrency}<small>{row.rateBasis}</small></td><td>{amount(row.fee)} {row.feeCurrency}</td><td>{row.sourceId ? <a href={`/api/tax-evidence/documents/${row.sourceId}?scope=${scope}`}>Original statement</a> : "Missing evidence"}</td></tr>)}</tbody></table></div>{!report.conversions.length ? <p>No complete FX conversions recorded for this owner and year. Missing conversion legs are listed under exceptions.</p> : null}</Card>
      <Card><h2>Account and currency reconciliation</h2><p>Opening + recorded movements − closing. A match proves arithmetic only; statement coverage and exceptions still require review. Bank opening/closing balances are declared on import and must be checked against the original.</p><div className={styles.scroll}><table><thead><tr><th>Account</th><th>Currency</th><th>Opening</th><th>Movement</th><th>Closing</th><th>Variance / status</th></tr></thead><tbody>{report.balances.map((row) => <tr key={row.id}><td>{row.account}</td><td>{row.currency}</td><td>{amount(row.opening)}</td><td>{amount(row.movement)}</td><td>{amount(row.closing)}</td><td>{amount(row.variance)}<small>{row.status.replaceAll("_", " ")}</small></td></tr>)}</tbody></table></div></Card>
      <Card><h2>Transfer review</h2><p>Candidates use the same currency, amount and a seven-day window. Confirm only after comparing statements and references. Ambiguous pairs remain candidates.</p>
        <label>Review note<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Source references, settlement timing and any fee difference" /></label>
        <div className={styles.scroll}><table><thead><tr><th>Withdrawal</th><th>Receipt</th><th>Currency / amounts</th><th>Status</th><th>Action</th></tr></thead><tbody>{report.transfers.map((row) => <tr key={`${row.outgoingId}:${row.incomingId}`}><td>{row.outgoingDate}<br />{row.outgoingAccount}</td><td>{row.incomingDate}<br />{row.incomingAccount}</td><td>{row.currency} {amount(row.outgoingAmount)} → {amount(row.incomingAmount)}<small>Difference {amount(row.difference)}</small></td><td>{row.status}<small>{row.note}</small></td><td><button type="button" disabled={busy} onClick={() => review(row.outgoingId, row.incomingId, row.status === "confirmed" ? "unmatch" : "match")}>{row.status === "confirmed" ? "Undo match" : "Confirm pair"}</button></td></tr>)}</tbody></table></div>
        <details><summary>Manually pair records with fees or timing differences</summary><div className={styles.toolbar}><label>Withdrawal<select value={outgoing} onChange={(event) => setOutgoing(event.target.value)}><option value="">Choose a withdrawal</option>{cashRows.filter((row) => (row.amount ?? 0) < 0).map((row) => <option key={row.id} value={row.id}>{row.date} · {row.account} · {row.currency} {amount(row.amount)}</option>)}</select></label><label>Receipt<select value={incoming} onChange={(event) => setIncoming(event.target.value)}><option value="">Choose a receipt</option>{cashRows.filter((row) => (row.amount ?? 0) > 0).map((row) => <option key={row.id} value={row.id}>{row.date} · {row.account} · {row.currency} {amount(row.amount)}</option>)}</select></label><button type="button" disabled={busy || !outgoing || !incoming} onClick={() => review(outgoing, incoming, "match")}>Confirm with note</button></div></details>
        <p>{report.reviews.length} review actions retained with author, timestamp and note.</p>
      </Card>
      <Card><h2>Source evidence</h2><div className={styles.scroll}><table><thead><tr><th>Source</th><th>Account</th><th>Coverage</th><th>File</th><th>Checksum</th></tr></thead><tbody>{report.sources.map((source) => <tr key={source.id}><td>{source.system}</td><td>{source.account}</td><td>{source.startDate} – {source.endDate}</td><td><a href={`/api/tax-evidence/documents/${source.id}?scope=${scope}`}>{source.filename}</a></td><td><code title={source.sha256}>{source.sha256.slice(0, 12)}…</code></td></tr>)}</tbody></table></div>{!report.sources.length ? <p>Missing evidence: import the original statements and supporting documents below.</p> : null}</Card>
      <Card><h2>Exceptions and missing evidence</h2><p>{report.exceptions.length} items. All exceptions are included in the ZIP.</p><ul className={styles.exceptions}>{report.exceptions.slice(0, 100).map((row, index) => <li key={`${row.code}:${row.transactionId}:${index}`}><strong>{row.code.replaceAll("_", " ")}</strong> — {row.detail}{row.transactionId ? <small>Transaction {row.transactionId}</small> : null}</li>)}</ul></Card>
      <Card><h2>Recorded transactions</h2><div className={styles.scroll}><table><thead><tr><th>Date</th><th>Account</th><th>Source category</th><th>Currency / amount</th><th>Description</th></tr></thead><tbody>{report.transactions.slice(0, 200).map((row) => <tr key={row.id}><td>{row.date}<small>Settled {row.settlementDate ?? "not supplied"}</small></td><td>{row.account}</td><td>{row.category}</td><td>{row.currency} {amount(row.amount)}</td><td>{row.description}<small>{row.externalId}</small></td></tr>)}</tbody></table></div><p>Showing up to 200 rows. Downloads contain all {report.transactions.length} records.</p></Card>
    </> : null}
    <Card><h2>Bank statements and artwork documents</h2><p>Files are assigned to the selected owner, {scope === "personal" ? "Personal" : "SMSF"}. Preview checks the file before it is recorded.</p>
      <form onSubmit={importFile} onChange={() => setPreviewKey("")} className={styles.importForm}>
        <label>Source<select value={system} onChange={(event) => { setSystem(event.target.value); setFile(null); setImportResult(null); }}><option>Westpac</option><option>Macquarie</option><option>Artwork</option></select></label>
        <label>Original file<input type="file" accept={system === "Artwork" ? ".pdf,.txt,.csv,.xml" : system === "Westpac" ? ".csv,.pdf" : ".csv"} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <label>Stable account identifier<input name="account" required maxLength={128} placeholder={system === "Artwork" ? "Artwork sale reference" : "Account number or consistent private account ID"} /></label>
          <label>Statement / evidence period from<input name="from" type="date" required defaultValue={`${year - 1}-07-01`} key={`from:${year}`} /></label>
          <label>To<input name="to" type="date" required defaultValue={`${year}-06-30`} key={`to:${year}`} /></label>
          {system !== "Artwork" ? <><label>Account currency<input name="currency" defaultValue={system === "Westpac" ? "USD" : "AUD"} key={`currency:${system}`} required minLength={3} maxLength={3} /></label><label>Opening statement balance (CSV only, optional)<input name="opening" type="number" step="any" /></label><label>Closing statement balance (CSV only, optional)<input name="closing" type="number" step="any" /></label><p>CSV needs Date, Description and Amount (signed), or Debit/Credit columns. Reference, Currency and Balance are optional. Use ISO or DD/MM/YYYY dates. Westpac also accepts text-based Account Activity PDFs; preview the extracted rows before recording. Leave PDF opening/closing balances blank; the Available tile is not a statement balance.</p></> : <p>Attach the contract, invoice, commission/settlement or provenance document. This records evidence only and creates no artwork tax calculation.</p>}
        <div className={styles.toolbar}><button type="submit" value="preview" disabled={busy || !file}>Preview file</button><button type="submit" value="commit" className="primary" disabled={busy || !previewKey}>Record evidence</button></div>
      </form>
      {importResult ? <div role="status"><p>{String(importResult.note ?? "Evidence recorded.")}</p><p>{importResult.preview ? "Preview" : "Imported"}: {String(importResult.transactions ?? importResult.imported ?? 0)} transaction rows. {importResult.duplicates != null ? `${importResult.duplicates} exact/existing IDs skipped.` : ""}</p>{Array.isArray(importResult.conflicts) && importResult.conflicts.length ? <Notice>{importResult.conflicts.length} source amendments need review; stored transactions were retained.</Notice> : null}</div> : null}
      {Array.isArray(importResult?.rows) ? <div className={styles.scroll}><table><thead><tr><th>Preview date</th><th>Description</th><th>Currency</th><th>Signed amount</th></tr></thead><tbody>{(importResult.rows as Array<{ date: string; description: string; currency: string; amount: number }>).map((row, index) => <tr key={index}><td>{row.date}</td><td>{row.description}</td><td>{row.currency}</td><td>{amount(row.amount)}</td></tr>)}</tbody></table><p>Preview shows up to 50 rows. Verify the amounts and selected owner before recording.</p></div> : null}
    </Card>
  </main>;
}
