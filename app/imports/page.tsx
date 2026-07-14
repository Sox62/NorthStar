"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, Notice, StatusBadge, SummaryGrid } from "@/northstar/components";

type ImportType = "ibkr" | "directshares";
type OwnerType = "PERSONAL" | "SMSF";
type Result = Record<string, unknown> & { error?: string; preview?: boolean; synced?: boolean };

const money = (value: unknown) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(value ?? 0));

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
      setResults((current) => ({ ...current, [type]: payload }));
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

  return (
    <main className="shell">
      <PageHeader
        title="Broker imports"
        description="Sync IBKR directly from its Flex Web Service or upload broker files manually. Every import is assigned to one legal owner."
        links={[
          { href: "/", label: "← Dashboard" },
          { href: "/cash", label: "Cash accounts" },
          { href: "/assets", label: "Physical platinum" },
        ]}
      />

      <Card className="syncCard">
        <div>
          <p className="eyebrow">Automated broker feed</p>
          <h2 className="cardTitle">IBKR Flex Web Service</h2>
          <p className="cardIntro">Uses the private IBKR token and Flex Query ID stored in Railway. It updates trades, Open Positions and IBKR cash without uploading an XML file.</p>
          <label className="field compactOwner">
            <span>Legal owner</span>
            <select value={owners.ibkr} onChange={(event) => setOwners((value) => ({ ...value, ibkr: event.target.value as OwnerType }))}>
              <option value="SMSF">SMSF</option>
              <option value="PERSONAL">Personal</option>
            </select>
          </label>
        </div>
        <div>
          <button className="primary" type="button" onClick={syncIbkr} disabled={syncing}>
            {syncing ? "Syncing IBKR…" : "Sync IBKR now"}
          </button>
        </div>
        {syncResult && <div style={{ gridColumn: "1 / -1" }}><ImportSummary result={syncResult} /></div>}
      </Card>

      <section className="grid two equal sectionStack">
        <Importer
          type="ibkr"
          title="IBKR Flex XML"
          subtitle="Manual fallback"
          accept=".xml"
          owner={owners.ibkr}
          result={results.ibkr}
          busy={busy === "ibkr"}
          onOwner={(owner) => setOwners((value) => ({ ...value, ibkr: owner }))}
          onFile={(file) => {
            setFiles((value) => ({ ...value, ibkr: file }));
            setResults((value) => ({ ...value, ibkr: undefined }));
          }}
          onPreview={() => send("ibkr", false)}
          onCommit={() => send("ibkr", true)}
        />
        <Importer
          type="directshares"
          title="Directshares holdings CSV"
          subtitle="Personal portfolio file"
          accept=".csv"
          owner={owners.directshares}
          result={results.directshares}
          busy={busy === "directshares"}
          onOwner={(owner) => setOwners((value) => ({ ...value, directshares: owner }))}
          onFile={(file) => {
            setFiles((value) => ({ ...value, directshares: file }));
            setResults((value) => ({ ...value, directshares: undefined }));
          }}
          onPreview={() => send("directshares", false)}
          onCommit={() => send("directshares", true)}
        />
      </section>

      <Notice tone="neutral" title="IBKR valuation">
        NorthStar treats Open Positions as the authoritative current holdings snapshot and Cash Report as the IBKR cash balance. Trades are deduplicated using IBKR transaction identifiers.
      </Notice>
    </main>
  );
}

function Importer({ title, subtitle, accept, owner, result, busy, onOwner, onFile, onPreview, onCommit }: {
  type: ImportType;
  title: string;
  subtitle: string;
  accept: string;
  owner: OwnerType;
  result?: Result;
  busy: boolean;
  onOwner: (owner: OwnerType) => void;
  onFile: (file: File) => void;
  onPreview: () => void;
  onCommit: () => void;
}) {
  const isPreview = result?.preview === true;
  return (
    <Card className="importCard">
      <p className="eyebrow">{subtitle}</p>
      <h2 className="cardTitle">{title}</h2>
      <p className="cardIntro">File contents remain inside this private NorthStar instance.</p>
      <label className="field">
        <span>Legal owner</span>
        <select value={owner} onChange={(event) => onOwner(event.target.value as OwnerType)}>
          <option value="PERSONAL">Personal</option>
          <option value="SMSF">SMSF</option>
        </select>
      </label>
      <label className="fileButton">
        <input type="file" accept={accept} onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])} />
        Choose file
      </label>
      <div className="buttonRow">
        <button onClick={onPreview} disabled={busy}>Validate</button>
        {isPreview && <button className="primary" onClick={onCommit} disabled={busy}>Save import</button>}
      </div>
      {busy && <p className="small">Processing…</p>}
      {result && <ImportSummary result={result} />}
    </Card>
  );
}

function ImportSummary({ result }: { result: Result }) {
  if (result.error) return <Notice tone="error" title="Import failed">{result.error}</Notice>;

  const entries = Object.entries(result).filter(
    ([key]) => !["preview", "note", "source", "owner", "ownerType", "storageMode", "synced", "generatedAt"].includes(key),
  );

  return (
    <div className="result">
      <StatusBadge>{result.preview ? "Validated" : result.synced ? "Synced" : "Saved"}</StatusBadge>
      <SummaryGrid
        entries={entries.map(([key, value]) => [
          key.replace(/([A-Z])/g, " $1"),
          /value|cost|pnl|cash/i.test(key) ? money(value) : String(value),
        ])}
      />
      {result.note != null && <p className="small">{String(result.note)}</p>}
      {result.storageMode != null && <p className="small">Storage: {String(result.storageMode)}</p>}
    </div>
  );
}
