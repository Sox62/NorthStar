"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, Notice, StatusBadge, SummaryGrid } from "@/northstar/components";

type ImportType = "ibkr" | "directshares" | "directsharesNotes";
type OwnerType = "PERSONAL" | "SMSF";
type Result = Record<string, unknown> & { error?: string; preview?: boolean; synced?: boolean };

const money = (value: unknown) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(value ?? 0));

export default function Imports() {
  const [files, setFiles] = useState<Partial<Record<ImportType, File[]>>>({});
  const [owners, setOwners] = useState<Record<ImportType, OwnerType>>({ ibkr: "SMSF", directshares: "PERSONAL", directsharesNotes: "PERSONAL" });
  const [results, setResults] = useState<Partial<Record<ImportType, Result>>>({});
  const [busy, setBusy] = useState<ImportType | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<Result | undefined>();
  const [directsharesSyncing, setDirectsharesSyncing] = useState(false);
  const [directsharesSyncResult, setDirectsharesSyncResult] = useState<Result | undefined>();

  const send = async (type: ImportType, commit: boolean) => {
    const selectedFiles = files[type] ?? [];
    const file = selectedFiles[0];
    if (!file) return;
    setBusy(type);
    try {
      const endpoint = type === "directsharesNotes" ? "directshares-notes" : type;
      const init: RequestInit = { method: "POST" };
      if (type === "directsharesNotes") {
        const form = new FormData();
        selectedFiles.forEach((item) => form.append("files", item));
        init.body = form;
      } else {
        init.body = await file.text();
        init.headers = { "content-type": type === "ibkr" ? "application/xml" : "text/csv" };
      }
      const response = await fetch(`/api/import/${endpoint}?commit=${commit ? 1 : 0}&owner=${owners[type]}`, init);
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

  const syncDirectsharesEmail = async () => {
    setDirectsharesSyncing(true);
    setDirectsharesSyncResult(undefined);
    try {
      const response = await fetch(`/api/sync/directshares?owner=${owners.directsharesNotes}`, { method: "POST" });
      setDirectsharesSyncResult(await response.json());
    } finally {
      setDirectsharesSyncing(false);
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
          { href: "/roadmap", label: "Roadmap" },
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

      <Card className="syncCard">
        <div>
          <p className="eyebrow">Automated email feed</p>
          <h2 className="cardTitle">Directshares confirmations</h2>
          <p className="cardIntro">Reads broker confirmation emails from the configured mailbox or label, parses attached PDFs and imports new contract notes only once.</p>
          <label className="field compactOwner">
            <span>Legal owner</span>
            <select value={owners.directsharesNotes} onChange={(event) => setOwners((value) => ({ ...value, directsharesNotes: event.target.value as OwnerType }))}>
              <option value="PERSONAL">Personal</option>
              <option value="SMSF">SMSF</option>
            </select>
          </label>
        </div>
        <div>
          <button className="primary" type="button" onClick={syncDirectsharesEmail} disabled={directsharesSyncing}>
            {directsharesSyncing ? "Syncing Directshares…" : "Sync Directshares email"}
          </button>
        </div>
        {directsharesSyncResult && <div style={{ gridColumn: "1 / -1" }}><ImportSummary result={directsharesSyncResult} /></div>}
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
          onFiles={(selected) => {
            setFiles((value) => ({ ...value, ibkr: selected }));
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
          onFiles={(selected) => {
            setFiles((value) => ({ ...value, directshares: selected }));
            setResults((value) => ({ ...value, directshares: undefined }));
          }}
          onPreview={() => send("directshares", false)}
          onCommit={() => send("directshares", true)}
        />
        <Importer
          type="directsharesNotes"
          title="Directshares contract notes"
          subtitle="Email confirmation PDFs"
          accept=".pdf,.txt"
          multiple
          owner={owners.directsharesNotes}
          result={results.directsharesNotes}
          busy={busy === "directsharesNotes"}
          onOwner={(owner) => setOwners((value) => ({ ...value, directsharesNotes: owner }))}
          onFiles={(selected) => {
            setFiles((value) => ({ ...value, directsharesNotes: selected }));
            setResults((value) => ({ ...value, directsharesNotes: undefined }));
          }}
          onPreview={() => send("directsharesNotes", false)}
          onCommit={() => send("directsharesNotes", true)}
        />
      </section>

      <Notice tone="neutral" title="IBKR valuation">
        NorthStar treats Open Positions as the authoritative current holdings snapshot and Cash Report as the IBKR cash balance. Trades are deduplicated using IBKR transaction identifiers.
      </Notice>
    </main>
  );
}

function Importer({ title, subtitle, accept, multiple = false, owner, result, busy, onOwner, onFiles, onPreview, onCommit }: {
  type: ImportType;
  title: string;
  subtitle: string;
  accept: string;
  multiple?: boolean;
  owner: OwnerType;
  result?: Result;
  busy: boolean;
  onOwner: (owner: OwnerType) => void;
  onFiles: (files: File[]) => void;
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
        <input type="file" accept={accept} multiple={multiple} onChange={(event) => event.target.files?.length && onFiles(Array.from(event.target.files))} />
        {multiple ? "Choose files" : "Choose file"}
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
    ([key, value]) => !["preview", "note", "source", "owner", "ownerType", "storageMode", "synced", "generatedAt"].includes(key)
      && !(key === "errors" && Array.isArray(value) && value.length === 0),
  );

  return (
    <div className="result">
      <StatusBadge>{result.preview ? "Validated" : result.synced ? "Synced" : "Saved"}</StatusBadge>
      <SummaryGrid
        entries={entries.map(([key, value]) => [
          key.replace(/([A-Z])/g, " $1"),
          /value|cost|pnl|cash|fee|consideration/i.test(key) ? money(value) : Array.isArray(value) ? value.join("; ") : String(value),
        ])}
      />
      {result.note != null && <p className="small">{String(result.note)}</p>}
      {result.storageMode != null && <p className="small">Storage: {String(result.storageMode)}</p>}
    </div>
  );
}
