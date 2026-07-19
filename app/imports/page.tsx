"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { dataHealth } from "@/northstar/lib/data-health";
import type { DashboardData } from "@/lib/storage";
import { Card, Notice, StatusBadge, SummaryGrid } from "@/northstar/components";

type ImportType = "ibkr" | "directshares" | "directsharesNotes" | "dividends";
type OwnerType = "PERSONAL" | "SMSF";
type Result = Record<string, unknown> & { error?: string; preview?: boolean; synced?: boolean };
type SyncRun = DashboardData["syncRuns"][number];
type FreshnessCheck = DashboardData["freshness"][number];

const syncSources = ["IBKR", "Directshares Email", "Directshares Dividends", "ABC Bullion"];

const money = (value: unknown) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(value ?? 0));

async function loadDashboard(): Promise<DashboardData> {
  const response = await fetch("/api/dashboard?scope=overall", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load sync status");
  return payload as DashboardData;
}

export default function SyncPage() {
  const [files, setFiles] = useState<Partial<Record<ImportType, File[]>>>({});
  const [owners, setOwners] = useState<Record<ImportType, OwnerType>>({ ibkr: "SMSF", directshares: "PERSONAL", directsharesNotes: "PERSONAL", dividends: "PERSONAL" });
  const [results, setResults] = useState<Partial<Record<ImportType, Result>>>({});
  const [busy, setBusy] = useState<ImportType | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<Result | undefined>();
  const [directsharesSyncing, setDirectsharesSyncing] = useState(false);
  const [directsharesSyncResult, setDirectsharesSyncResult] = useState<Result | undefined>();
  const [dividendSyncing, setDividendSyncing] = useState(false);
  const [dividendSyncResult, setDividendSyncResult] = useState<Result | undefined>();

  const refreshDashboard = async () => {
    setDashboardError("");
    setDashboardLoading(true);
    try {
      setDashboard(await loadDashboard());
    } catch (reason) {
      setDashboardError(reason instanceof Error ? reason.message : "Unable to load sync status");
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    void refreshDashboard();
  }, []);

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
        init.headers = { "content-type": type === "ibkr" ? "application/xml" : file.type || (type === "dividends" ? "text/plain" : "text/csv") };
      }
      const response = await fetch(`/api/import/${endpoint}?commit=${commit ? 1 : 0}&owner=${owners[type]}`, init);
      const payload = await response.json();
      setResults((current) => ({ ...current, [type]: payload }));
      if (commit) void refreshDashboard();
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
      void refreshDashboard();
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
      void refreshDashboard();
    } finally {
      setDirectsharesSyncing(false);
    }
  };

  const syncDividendEmail = async () => {
    setDividendSyncing(true);
    setDividendSyncResult(undefined);
    try {
      const response = await fetch(`/api/sync/dividends?owner=${owners.dividends}`, { method: "POST" });
      setDividendSyncResult(await response.json());
      void refreshDashboard();
    } finally {
      setDividendSyncing(false);
    }
  };

  return (
    <main className="shell">
      <PageHeader
        title="Sync"
        description="Monitor data freshness, run broker feeds and upload fallback files. Every import is assigned to one legal owner."
        links={[
          { href: "/", label: "← Dashboard" },
          { href: "/holdings", label: "Holdings" },
          { href: "/cash", label: "Cash accounts" },
          { href: "/prices", label: "Pricing" },
          { href: "/roadmap", label: "Roadmap" },
        ]}
      />

      <SyncStatusOverview
        dashboard={dashboard}
        loading={dashboardLoading}
        error={dashboardError}
        onRefresh={() => void refreshDashboard()}
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

      <Card className="syncCard">
        <div>
          <p className="eyebrow">Automated income feed</p>
          <h2 className="cardTitle">Directshares dividends</h2>
          <p className="cardIntro">Reads dividend notification emails from the configured mailbox or label and imports cash income, foreign withholding tax and AUD proceeds.</p>
          <label className="field compactOwner">
            <span>Legal owner</span>
            <select value={owners.dividends} onChange={(event) => setOwners((value) => ({ ...value, dividends: event.target.value as OwnerType }))}>
              <option value="PERSONAL">Personal</option>
              <option value="SMSF">SMSF</option>
            </select>
          </label>
        </div>
        <div>
          <button className="primary" type="button" onClick={syncDividendEmail} disabled={dividendSyncing}>
            {dividendSyncing ? "Syncing dividends…" : "Sync dividend email"}
          </button>
        </div>
        {dividendSyncResult && <div style={{ gridColumn: "1 / -1" }}><ImportSummary result={dividendSyncResult} /></div>}
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
          subtitle="Bulk CSV, email PDFs or text"
          accept=".csv,.pdf,.txt"
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
        <Importer
          type="dividends"
          title="Dividend payments"
          subtitle="CSV or email text"
          accept=".csv,.txt"
          owner={owners.dividends}
          result={results.dividends}
          busy={busy === "dividends"}
          onOwner={(owner) => setOwners((value) => ({ ...value, dividends: owner }))}
          onFiles={(selected) => {
            setFiles((value) => ({ ...value, dividends: selected }));
            setResults((value) => ({ ...value, dividends: undefined }));
          }}
          onPreview={() => send("dividends", false)}
          onCommit={() => send("dividends", true)}
        />
      </section>

      <Notice tone="neutral" title="IBKR valuation">
        NorthStar treats Open Positions as the authoritative current holdings snapshot and Cash Report as the IBKR cash balance. Trades are deduplicated using IBKR transaction identifiers.
      </Notice>
    </main>
  );
}

function SyncStatusOverview({ dashboard, loading, error, onRefresh }: {
  dashboard: DashboardData | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const health = dataHealth(dashboard?.syncRuns ?? [], dashboard?.freshness ?? []);
  const latestBySource = new Map<string, SyncRun>();
  for (const run of dashboard?.syncRuns ?? []) {
    if (!latestBySource.has(run.source)) latestBySource.set(run.source, run);
  }

  return (
    <section className="syncStatusStack">
      <Card className="syncStatusCard">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Data status</p>
            <h2 className="cardTitle">Sync and valuation health</h2>
            <p className="cardIntro">Broker feeds, pricing sources and valuation checks for the portfolio.</p>
          </div>
          <div className="syncStatusActions">
            <StatusBadge tone={health.tone === "good" ? "good" : "warning"}>{health.label}</StatusBadge>
            <button type="button" onClick={onRefresh} disabled={loading}>Refresh status</button>
          </div>
        </div>

        {loading ? (
          <p className="empty">Loading source status...</p>
        ) : error ? (
          <Notice tone="error" title="Unable to load sync status">{error}</Notice>
        ) : (
          <>
            <div className="syncHealthLine">
              <span className={`nsStatusPip is-${health.tone}`} />
              <strong>{health.label}</strong>
              <span>{dashboard?.storageMode ?? "No storage"} · {dashboard?.holdings.length ?? 0} positions · NAV {money(dashboard?.totalValue)}</span>
            </div>
            <section className="nsFreshnessStrip" aria-label="Data source status">
              {syncSources.map((source) => {
                const run = latestBySource.get(source);
                const status = run?.status ?? "skipped";
                return (
                  <div key={source} className={`nsFreshnessItem is-${status}`}>
                    <span>{source}</span>
                    <strong>{run ? `${statusLabel(status)} · ${fmtRunTime(run.finishedAt)}` : "No run recorded"}</strong>
                    <em>{run?.error ?? run?.message ?? "Waiting for first sync run."}</em>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </Card>

      {!loading && !error && dashboard ? (
        <section className="syncStatusGrid">
          <Card className="syncStatusCard">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Valuation freshness</p>
                <h2 className="cardTitle">Pricing inputs</h2>
              </div>
            </div>
            <ValuationChecks freshness={dashboard.freshness} />
          </Card>

          <Card className="syncStatusCard">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Recent activity</p>
                <h2 className="cardTitle">Sync and pricing runs</h2>
              </div>
            </div>
            <RecentActivityPanel syncRuns={dashboard.syncRuns} />
          </Card>
        </section>
      ) : null}
    </section>
  );
}

function ValuationChecks({ freshness }: { freshness: FreshnessCheck[] }) {
  if (!freshness.length) return <p className="empty">No valuation freshness checks are available yet.</p>;
  return (
    <section className="nsValuationChecks" aria-label="Valuation freshness checks">
      {freshness.map((check) => (
        <article key={check.source} className={`nsValuationCheck is-${check.status}`}>
          <div>
            <span>{check.source}</span>
            <strong>{check.status === "fresh" ? "Current" : check.status === "fallback" ? "Cost basis" : check.status}</strong>
          </div>
          <p>{check.detail}</p>
          <em>{check.ageDays == null ? fmtDate(check.asOf) : `${fmtDate(check.asOf)} · ${check.ageDays.toFixed(1)}d old`}</em>
        </article>
      ))}
    </section>
  );
}

function RecentActivityPanel({ syncRuns }: { syncRuns: SyncRun[] }) {
  return (
    <div className="nsActivityRows">
      {syncRuns.length ? syncRuns.slice(0, 6).map((run, index) => (
        <article key={`${run.source}-${run.finishedAt}-${index}`} className={`nsActivityRow is-${run.status}`}>
          <div>
            <strong>{run.source}</strong>
            <span>{run.trigger} · {fmtRunTime(run.finishedAt)}</span>
          </div>
          <em>{run.status}</em>
          <p>{run.error ?? run.message ?? "Completed without a message."}</p>
        </article>
      )) : (
        <article className="nsActivityRow is-skipped">
          <div>
            <strong>No sync runs recorded</strong>
            <span>Waiting for the next broker or pricing sync.</span>
          </div>
          <em>pending</em>
          <p>Recent activity will appear here after scheduled or manual syncs run.</p>
        </article>
      )}
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "success") return "Synced";
  if (status === "failed") return "Failed";
  if (status === "partial") return "Partial";
  return "Skipped";
}

function fmtRunTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function fmtDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
  }).format(date);
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
