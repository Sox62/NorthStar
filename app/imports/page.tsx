"use client";

import Link from "next/link";
import { useState } from "react";


type ImportType = "ibkr" | "directshares";
type OwnerType = "PERSONAL" | "SMSF";
type Result = Record<string, unknown> & { error?: string; preview?: boolean };

const money = (value: unknown) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(value ?? 0));

export default function Imports() {
  const [files, setFiles] = useState<Partial<Record<ImportType, File>>>({});
  const [owners, setOwners] = useState<Record<ImportType, OwnerType>>({ ibkr: "SMSF", directshares: "PERSONAL" });
  const [results, setResults] = useState<Partial<Record<ImportType, Result>>>({});
  const [busy, setBusy] = useState<ImportType | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<Result | undefined>();

  const send = async (type: ImportType, commit: boolean) => {
    const file = files[type];
    if (!file) return;
    setBusy(type);
    try {
      const response = await fetch(`/api/import/${type}?commit=${commit ? 1 : 0}&owner=${owners[type]}`, {
        method: "POST",
        body: await file.text(),
        headers: { "content-type": type === "ibkr" ? "application/xml" : "text/csv" },
      });
      const payload = await response.json();
      setResults(current => ({ ...current, [type]: payload }));
    } finally {
      setBusy(null);
    }
  };

  const syncIbkr = async () => {
    setSyncing(true);
    setSyncResult(undefined);
    try {
      const response = await fetch(`/api/sync/ibkr?owner=${owners.ibkr}`, { method: "POST" });
      setSyncResult(await response.json());
    } finally {
      setSyncing(false);
    }
  };

  return <main className="shell">
    <div className="pageNav"><Link href="/">← Dashboard</Link><Link href="/cash">Cash accounts</Link><Link href="/assets">Physical platinum</Link></div>
    <div className="brand"><h1>NorthStar imports</h1><p>Sync IBKR directly from its Flex Web Service or upload broker files manually.</p></div>

    <section className="card syncCard" style={{ marginTop: 24 }}>
      <div>
        <div className="label">Automated broker feed</div>
        <div className="value">IBKR Flex Web Service</div>
        <p className="small">Uses the private IBKR token and Flex Query ID stored in Railway. It updates trades, Open Positions and IBKR cash without uploading an XML file.</p>
        <label className="field compactOwner"><span>Legal owner</span><select value={owners.ibkr} onChange={event => setOwners(value => ({ ...value, ibkr: event.target.value as OwnerType }))}><option value="SMSF">SMSF</option><option value="PERSONAL">Personal</option></select></label>
      </div>
      <div><button className="primary" type="button" onClick={syncIbkr} disabled={syncing}>{syncing ? "Syncing IBKR…" : "Sync IBKR now"}</button></div>
      {syncResult && <div style={{ gridColumn: "1 / -1" }}><ImportSummary result={syncResult} /></div>}
    </section>

    <section className="grid two equal" style={{ marginTop: 16 }}>
      <Importer type="ibkr" title="IBKR Flex XML — manual fallback" accept=".xml" owner={owners.ibkr} result={results.ibkr} busy={busy === "ibkr"}
        onOwner={owner => setOwners(value => ({ ...value, ibkr: owner }))}
        onFile={file => { setFiles(value => ({ ...value, ibkr: file })); setResults(value => ({ ...value, ibkr: undefined })); }}
        onPreview={() => send("ibkr", false)} onCommit={() => send("ibkr", true)} />
      <Importer type="directshares" title="Directshares holdings CSV" accept=".csv" owner={owners.directshares} result={results.directshares} busy={busy === "directshares"}
        onOwner={owner => setOwners(value => ({ ...value, directshares: owner }))}
        onFile={file => { setFiles(value => ({ ...value, directshares: file })); setResults(value => ({ ...value, directshares: undefined })); }}
        onPreview={() => send("directshares", false)} onCommit={() => send("directshares", true)} />
    </section>
    <section className="card notice" style={{ marginTop: 16 }}>
      <strong>IBKR valuation</strong>
      <p>NorthStar treats Open Positions as the authoritative current holdings snapshot and Cash Report as the IBKR cash balance. Trades are deduplicated using IBKR transaction identifiers.</p>
    </section>
  </main>;
}

function Importer({ title, accept, owner, result, busy, onOwner, onFile, onPreview, onCommit }: {
  type: ImportType; title: string; accept: string; owner: OwnerType; result?: Result; busy: boolean;
  onOwner: (owner: OwnerType) => void; onFile: (file: File) => void; onPreview: () => void; onCommit: () => void;
}) {
  const isPreview = result?.preview === true;
  return <section className="card importCard">
    <div className="value">{title}</div>
    <p className="small">File contents remain inside this NorthStar instance.</p>
    <label className="field"><span>Legal owner</span><select value={owner} onChange={event => onOwner(event.target.value as OwnerType)}><option value="PERSONAL">Personal</option><option value="SMSF">SMSF</option></select></label>
    <label className="fileButton"><input type="file" accept={accept} onChange={event => event.target.files?.[0] && onFile(event.target.files[0])} />Choose file</label>
    <div className="buttonRow"><button onClick={onPreview} disabled={busy}>Validate</button>{isPreview && <button className="primary" onClick={onCommit} disabled={busy}>Save import</button>}</div>
    {busy && <p className="small">Processing…</p>}
    {result && <ImportSummary result={result} />}
  </section>;
}

function ImportSummary({ result }: { result: Result }) {
  if (result.error) return <div className="result error">{result.error}</div>;
  const entries = Object.entries(result).filter(([key]) => !["preview", "note", "source", "owner", "ownerType", "storageMode", "synced", "generatedAt"].includes(key));
  return <div className="result">
    <strong>{result.preview ? "Validated" : result.synced ? "Synced" : "Saved"}</strong>
    <div className="summaryGrid">{entries.map(([key, value]) => <div key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><strong>{/value|cost|pnl|cash/i.test(key) ? money(value) : String(value)}</strong></div>)}</div>
    {result.note != null && <p className="small">{String(result.note)}</p>}
    {result.storageMode != null && <p className="small">Storage: {String(result.storageMode)}</p>}
  </div>;
}
