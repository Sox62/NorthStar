"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Scope } from "@/lib/storage";
import type { StopExit, StopExitHistory } from "@/lib/risk/stopped-trades-types";
import styles from "./StoppedTrades.module.css";

const sourceLabel = { BROKER_REPORTED: "Broker stop execution", USER_CONFIRMED: "Sale linked · user confirmed", USER_RECORDED: "Manually recorded" };
const number = (value: number) => new Intl.NumberFormat("en-AU", { maximumFractionDigits: 4 }).format(value);
const price = (value: number | null, currency: string) => value == null ? "Not recorded" : `${currency} ${number(value)}`;
const emptyManual = { ownerType: "PERSONAL", broker: "IBKR", accountKey: "", symbol: "", currency: "AUD", exitDate: "", quantity: "", exitPrice: "", fees: "" };

async function load(scope: Scope): Promise<StopExitHistory> {
  const response = await fetch(`/api/risk/stopped-trades?scope=${scope}`, { cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Unable to load stopped-out history.");
  return value;
}

export default function StoppedTrades({ scope }: { scope: Scope }) {
  const [history, setHistory] = useState<StopExitHistory | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("sale");
  const [sale, setSale] = useState("");
  const [manual, setManual] = useState(emptyManual);
  const [stopPrice, setStopPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const entryId = useRef("");
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    let cancelled = false;
    setHistory(null); setError(""); setMessage(""); setSale("");
    setManual({ ...emptyManual, ownerType: scope === "smsf" ? "SMSF" : "PERSONAL" });
    setStopPrice(""); setNotes(""); entryId.current = "";
    load(scope).then(value => { if (!cancelled) setHistory(value); }).catch(reason => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [scope]);

  async function mutate(method: "POST" | "PATCH", body: unknown) {
    const requestScope = scope;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/risk/stopped-trades", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save the record.");
      const value = await load(requestScope);
      if (currentScope.current !== requestScope) return false;
      setHistory(value); setMessage(method === "POST" ? "Stopped-out trade recorded." : "History updated. The original sale is unchanged.");
      return true;
    } catch (reason) { if (currentScope.current === requestScope) setError(reason instanceof Error ? reason.message : "Unable to save the record."); return false; }
    finally { setSaving(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    entryId.current ||= crypto.randomUUID();
    const optional = (value: string) => value.trim() ? Number(value) : null;
    const body = mode === "sale" ? { mode, transactionId: sale, stopPrice: optional(stopPrice), notes }
      : { ...manual, mode, id: entryId.current, symbol: manual.symbol.toUpperCase(), currency: manual.currency.toUpperCase(),
        quantity: Number(manual.quantity), exitPrice: Number(manual.exitPrice), fees: optional(manual.fees), stopPrice: optional(stopPrice), notes };
    if (await mutate("POST", body)) {
      entryId.current = ""; setSale(""); setStopPrice(""); setNotes("");
      setManual({ ...emptyManual, ownerType: scope === "smsf" ? "SMSF" : "PERSONAL" });
    }
  }

  const active = history?.records.filter(record => !record.excluded) ?? [];
  const records = history?.records.filter(record => (showRemoved || !record.excluded)
    && `${record.symbol} ${record.name} ${record.broker} ${record.accountKey} ${record.notes}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  const known = new Set(active.map(record => record.id));
  const saleOptions = history?.sales.filter(item => !known.has(item.id)) ?? [];
  const selectedSale = saleOptions.find(item => item.transactionId === sale);

  function field(key: keyof typeof emptyManual, value: string) { setManual(current => ({ ...current, [key]: value })); }

  return <details className={styles.history}>
    <summary>Stopped-out trades <span>{history ? `${active.length} recorded` : "Loading…"}</span></summary>
    <div className={styles.content}>
      <p className={styles.help}>Keep the actual exits after positions close. Broker-identified closing stop executions appear automatically when supplied by Flex. You can also confirm a recorded sale or log an exit yourself.</p>
      <p className={styles.help}>Each fill or partial exit is a separate record. A price crossing a stop does not establish an execution. This journal does not post transactions or change tax calculations.</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <details className={styles.recorder}>
        <summary>Record a stopped-out trade</summary>
        <form onSubmit={save}>
          <label>Record from<select value={mode} onChange={event => setMode(event.target.value)}>
            <option value="sale">An imported sale</option><option value="manual">Manual exit record</option>
          </select></label>
          {mode === "sale" ? <>
            <label>Executed sale<select value={sale} onChange={event => setSale(event.target.value)} required disabled={!history || saving}>
              <option value="">Choose a sale…</option>
              {saleOptions.map(item => <option key={item.id} value={item.transactionId}>{item.exitDate} · {item.symbol} · {number(item.quantity)} @ {price(item.exitPrice, item.currency)} · {item.ownerType} · {item.broker} · {item.accountKey}</option>)}
            </select></label>
            {!saleOptions.length && history ? <p className={styles.help}>No unclassified imported sales are available in this scope. Use a manual record for an exit not yet imported.</p> : null}
            {selectedSale ? <p className={styles.help}>{selectedSale.symbol} · {selectedSale.ownerType} · {selectedSale.broker} {selectedSale.accountKey} · {number(selectedSale.quantity)} at {price(selectedSale.exitPrice, selectedSale.currency)} on {selectedSale.exitDate}. By saving, you confirm this sale was a stop exit.</p> : null}
          </> : <div className={styles.formGrid}>
            <label>Owner<select value={manual.ownerType} onChange={event => field("ownerType", event.target.value)} disabled={scope !== "overall"}><option value="PERSONAL">Personal</option><option value="SMSF">SMSF</option></select></label>
            <label>Broker<input value={manual.broker} onChange={event => field("broker", event.target.value)} required maxLength={80} /></label>
            <label>Account reference<input value={manual.accountKey} onChange={event => field("accountKey", event.target.value)} required maxLength={100} /></label>
            <label>Stock symbol<input value={manual.symbol} onChange={event => field("symbol", event.target.value)} required maxLength={40} /></label>
            <label>Exit date<input type="date" value={manual.exitDate} onChange={event => field("exitDate", event.target.value)} required /></label>
            <label>Trade currency<input value={manual.currency} onChange={event => field("currency", event.target.value.toUpperCase())} pattern="[A-Z]{3}" maxLength={3} required /></label>
            <label>Quantity exited<input type="number" min="0.00000001" step="any" value={manual.quantity} onChange={event => field("quantity", event.target.value)} required /></label>
            <label>Actual fill price<input type="number" min="0.00000001" step="any" value={manual.exitPrice} onChange={event => field("exitPrice", event.target.value)} required /></label>
            <label>Fees in trade currency (optional)<input type="number" min="0" step="any" value={manual.fees} onChange={event => field("fees", event.target.value)} /></label>
          </div>}
          <label>Stop level at exit (optional)<input type="number" min="0.00000001" step="any" value={stopPrice} onChange={event => setStopPrice(event.target.value)} /></label>
          <label>Notes / lesson learned<textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} rows={3} /></label>
          <button type="submit" className="button secondary" disabled={saving || !history}>{saving ? "Saving…" : "Save stopped-out trade"}</button>
        </form>
      </details>
      <div className={styles.toolbar}>
        <label className={styles.search}>Search history<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Symbol, broker or notes" /></label>
        <a className="button secondary" href={`/api/risk/stopped-trades?scope=${scope}&format=csv`}>Export CSV</a>
      </div>
      <label className={styles.removed}><input type="checkbox" checked={showRemoved} onChange={event => setShowRemoved(event.target.checked)} />Show removed classifications</label>
      <div className={styles.entries}>
        {records.map(record => <ExitCard key={record.id} record={record} saving={saving} update={() => void mutate("PATCH", { id: record.id, excluded: !record.excluded })} />)}
        {history && !records.length ? <p className={styles.help}>{active.length ? "No records match this search." : "No stopped-out trades recorded for this scope yet."}</p> : null}
      </div>
    </div>
  </details>;
}

function ExitCard({ record: r, saving, update }: { record: StopExit; saving: boolean; update: () => void }) {
  const gap = r.stopPrice == null ? null : (r.exitPrice / r.stopPrice - 1) * 100;
  return <article className={`${styles.entry} ${r.excluded ? styles.excluded : ""}`}>
    <header><div><strong>{r.symbol}</strong><small>{r.exitDate} · {r.ownerType} · {r.broker}</small></div><span>{r.excluded ? "Classification removed" : sourceLabel[r.source]}</span></header>
    <dl><div><dt>Quantity exited</dt><dd>{number(r.quantity)}</dd></div><div><dt>Actual fill</dt><dd>{price(r.exitPrice, r.currency)}</dd></div>
      <div><dt>Stop at exit</dt><dd>{price(r.stopPrice, r.currency)}</dd></div><div><dt>Fill vs stop</dt><dd>{gap == null ? "Not recorded" : `${gap > 0 ? "+" : ""}${number(gap)}%`}</dd></div>
      <div><dt>Fees</dt><dd>{price(r.fees, r.feeCurrency || r.currency)}</dd></div></dl>
    {r.notes ? <p className={styles.notes}>{r.notes}</p> : null}
    <details><summary>Record details</summary><p>{r.name} · account {r.accountKey}</p>
      {r.transactionExternalId ? <p>Trade reference: {r.transactionExternalId}</p> : <p>User-reported exit; no imported sale linked.</p>}
      {r.orderId ? <p>Order reference: {r.orderId}</p> : null}
      {r.createdAt && r.updatedAt ? <p>Recorded {new Date(r.createdAt).toLocaleString("en-AU")} · last reviewed {new Date(r.updatedAt).toLocaleString("en-AU")}</p> : <p>Execution details retained with the imported sale.</p>}
      <button type="button" className="button secondary" onClick={update} disabled={saving}>{r.excluded ? "Restore stopped-out classification" : "Remove stopped-out classification"}</button>
    </details>
  </article>;
}
