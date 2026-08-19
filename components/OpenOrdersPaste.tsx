"use client";

import { useState, type FormEvent } from "react";
import { Card, Notice, StatusBadge } from "@/northstar/components";
import styles from "./OpenOrdersPaste.module.css";

type Result = { imported: number; symbols: string[]; message: string };

export function OpenOrdersPaste() {
  const [text, setText] = useState("");
  const [ownerType, setOwnerType] = useState<"PERSONAL" | "SMSF">("SMSF");
  const [accountKey, setAccountKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/ibkr/open-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, ownerType, accountKey: accountKey.trim() || undefined }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Unable to record open orders");
      setResult(payload as Result);
      setText("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to record open orders");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Working orders</p>
          <h2 className="cardTitle">Paste IBKR open orders</h2>
        </div>
        <StatusBadge tone="warning">Manual until a feed exists</StatusBadge>
      </div>
      <p className="cardIntro">
        IBKR does not reserve cash for resting buy orders, so committed capital is invisible until the
        orders are recorded here. Individual accounts cannot use IBKR&apos;s OAuth Web API, so paste the
        order payload rather than re-typing it. Each paste replaces the previous set for that book.
      </p>

      {error ? <Notice tone="error" title="Paste rejected">{error}</Notice> : null}
      {result ? <p className={styles.ok}>{result.message}{result.symbols.length ? ` (${result.symbols.join(", ")})` : ""}</p> : null}

      <form className={styles.form} onSubmit={submit}>
        <div className={styles.controls}>
          <label>
            <span>Book</span>
            <select value={ownerType} onChange={(event) => setOwnerType(event.target.value as "PERSONAL" | "SMSF")}>
              <option value="SMSF">SMSF</option>
              <option value="PERSONAL">Personal</option>
            </select>
          </label>
          <label>
            <span>Account (optional)</span>
            <input value={accountKey} onChange={(event) => setAccountKey(event.target.value)} placeholder="U24473088" />
          </label>
        </div>
        <label className={styles.wide}>
          <span>Order payload</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            placeholder={'{"orders":[{"orderId":…,"ticker":"WGX","side":"BUY","orderType":"LIMIT","price":5.5,…}]}'}
            required
          />
        </label>
        <div className="buttonRow">
          <button className="primary" type="submit" disabled={busy}>{busy ? "Recording..." : "Record orders"}</button>
          <button type="button" onClick={() => { setText(""); setError(""); setResult(null); }} disabled={busy}>Clear</button>
        </div>
      </form>
    </Card>
  );
}
