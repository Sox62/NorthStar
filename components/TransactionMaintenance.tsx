"use client";

import { useState } from "react";
import { Card, Notice, StatusBadge } from "@/southernstar/components";

type Row = {
  externalId: string;
  symbol: string;
  tradeDate: string;
  type: string;
  netCash: number | null;
  taxes: number | null;
  broker: string;
  accountKey: string;
  source: string;
};

type Owner = "PERSONAL" | "SMSF";

const money = (value: number | null) =>
  value == null ? "" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);

const dayMonthYear = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")}`;
};

/**
 * Removing records that should never have been imported — a statement filed against the wrong
 * legal book, which re-importing cannot undo because the mistaken copy stays where it is.
 *
 * Nothing is removed without being listed and then ticked. The dry run runs first and reports what
 * it matched, and only then does a commit become available, because the one thing this surface
 * must never do is delete something the operator had not already seen on screen.
 */
export function TransactionMaintenance() {
  const [owner, setOwner] = useState<Owner>("SMSF");
  const [type, setType] = useState("DIVIDEND");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matched, setMatched] = useState<Row[] | null>(null);
  const [status, setStatus] = useState({ busy: false, error: "", message: "" });

  async function load() {
    setStatus({ busy: true, error: "", message: "" });
    setMatched(null);
    setSelected(new Set());
    try {
      const query = new URLSearchParams({ ownerType: owner, ...(type ? { type } : {}) });
      const response = await fetch(`/api/maintenance/transactions?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Unable to list transactions");
      setRows(payload.transactions as Row[]);
      setStatus({ busy: false, error: "", message: `${payload.count} record${payload.count === 1 ? "" : "s"} in the ${owner === "SMSF" ? "SMSF" : "Personal"} book.` });
    } catch (reason) {
      setRows(null);
      setStatus({ busy: false, error: reason instanceof Error ? reason.message : "Unable to list transactions", message: "" });
    }
  }

  async function run(commit: boolean) {
    const externalIds = [...selected];
    if (!externalIds.length) return;
    setStatus({ busy: true, error: "", message: "" });
    try {
      const response = await fetch("/api/maintenance/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerType: owner, externalIds, commit }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Unable to remove transactions");
      setMatched(commit ? null : (payload.matched as Row[]));
      setStatus({ busy: false, error: "", message: payload.message });
      if (commit) {
        setSelected(new Set());
        await load();
      }
    } catch (reason) {
      setStatus({ busy: false, error: reason instanceof Error ? reason.message : "Unable to remove transactions", message: "" });
    }
  }

  const toggle = (externalId: string) => {
    setMatched(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(externalId)) next.delete(externalId); else next.add(externalId);
      return next;
    });
  };

  return (
    <Card className="maintenanceCard">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Maintenance</p>
          <h2 className="cardTitle">Remove mis-filed records</h2>
          <p className="cardIntro">
            For a statement imported against the wrong legal book. Re-importing it in the right place does not
            remove the wrong copy, and both copies are then counted wherever a view spans the two books.
          </p>
        </div>
        {matched ? <StatusBadge tone="warning">Dry run</StatusBadge> : null}
      </div>

      <div className="maintenanceControls">
        <label>
          <span>Book</span>
          <select value={owner} onChange={(event) => { setOwner(event.target.value as Owner); setRows(null); setMatched(null); }}>
            <option value="SMSF">SMSF</option>
            <option value="PERSONAL">Personal</option>
          </select>
        </label>
        <label>
          <span>Type</span>
          <select value={type} onChange={(event) => { setType(event.target.value); setRows(null); setMatched(null); }}>
            <option value="DIVIDEND">Dividends</option>
            <option value="BUY">Buys</option>
            <option value="SELL">Sells</option>
            <option value="">All</option>
          </select>
        </label>
        <button type="button" onClick={() => void load()} disabled={status.busy}>List records</button>
      </div>

      {status.error ? <Notice tone="error" title="Maintenance failed">{status.error}</Notice> : null}
      {status.message && !status.error ? <p className="small">{status.message}</p> : null}

      {rows?.length ? (
        <>
          <div className="maintenanceTableWrap">
            <table className="maintenanceTable">
              <thead>
                <tr><th /><th>Symbol</th><th>Date</th><th>Type</th><th className="numeric">Net</th><th>Broker</th><th>Source</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.externalId} className={selected.has(row.externalId) ? "isSelected" : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(row.externalId)}
                        onChange={() => toggle(row.externalId)}
                        aria-label={`Select ${row.symbol} ${dayMonthYear(row.tradeDate)}`}
                      />
                    </td>
                    <td><strong>{row.symbol}</strong></td>
                    <td>{dayMonthYear(row.tradeDate)}</td>
                    <td>{row.type}</td>
                    <td className="numeric">{money(row.netCash)}</td>
                    <td>{row.broker}<span>{row.accountKey}</span></td>
                    <td>{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="buttonRow">
            <button type="button" onClick={() => void run(false)} disabled={status.busy || !selected.size}>
              Check {selected.size || ""} selected
            </button>
            {/* Commit is only offered once a dry run has shown the rows, never straight from a tick. */}
            <button className="primary" type="button" onClick={() => void run(true)} disabled={status.busy || !matched?.length}>
              Remove {matched?.length ?? 0} from {owner === "SMSF" ? "SMSF" : "Personal"}
            </button>
          </div>

          {matched?.length ? (
            <Notice title="These records would be removed">
              {matched.map((row) => `${row.symbol} ${dayMonthYear(row.tradeDate)} ${money(row.netCash)}`).join(" · ")}
              {". The copy in the other book is untouched."}
            </Notice>
          ) : null}
        </>
      ) : rows ? <p className="small">No records of that type in this book.</p> : null}
    </Card>
  );
}
