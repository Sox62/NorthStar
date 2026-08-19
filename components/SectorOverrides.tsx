"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Notice, StatusBadge } from "@/northstar/components";
import { SECTOR_COLORS, type Holding, type Sector } from "@/northstar/types";
import styles from "./SectorOverrides.module.css";

type Override = { symbol: string; sector: Sector; updatedAt: string };

const SECTORS = Object.keys(SECTOR_COLORS) as Sector[];

const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

export function SectorOverrides({ holdings, onChanged }: { holdings: Holding[]; onChanged: () => void }) {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const response = await fetch("/api/sector-overrides", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load overrides");
      setOverrides(payload.overrides ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load overrides");
    }
  }

  useEffect(() => { void refresh(); }, []);

  const overrideBySymbol = useMemo(
    () => new Map(overrides.map((item) => [item.symbol.toUpperCase(), item.sector])),
    [overrides],
  );

  // One row per distinct symbol, largest holding first, so the biggest mistakes surface first.
  const rows = useMemo(() => {
    const bySymbol = new Map<string, { symbol: string; name: string; sector: Sector; value: number }>();
    for (const holding of holdings) {
      const key = holding.symbol.toUpperCase();
      const current = bySymbol.get(key);
      if (current) current.value += holding.marketValueAud;
      else bySymbol.set(key, { symbol: key, name: holding.name, sector: holding.sector, value: holding.marketValueAud });
    }
    return [...bySymbol.values()].sort((left, right) => right.value - left.value);
  }, [holdings]);

  async function save(symbol: string, sector: Sector | null) {
    setBusy(symbol);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/sector-overrides", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, sector }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Unable to save override");
      await refresh();
      onChanged();
      setMessage(sector ? `${symbol} set to ${sector}.` : `${symbol} handed back to the classifier.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save override");
    } finally {
      setBusy("");
    }
  }

  return (
    <Card>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Classification</p>
          <h2 className="cardTitle">Sector overrides</h2>
        </div>
        <StatusBadge tone={overrides.length ? "good" : "warning"}>
          {overrides.length ? `${overrides.length} overridden` : "All automatic"}
        </StatusBadge>
      </div>
      <p className="cardIntro">
        SouthernStar classifies from the ticker and name alone, so anything it does not recognise lands in
        Broad equities. Set it here and the choice sticks — imports and syncs never overwrite it.
      </p>

      {error ? <Notice tone="error" title="Sector override failed">{error}</Notice> : null}
      {message ? <p className={styles.message}>{message}</p> : null}

      <div className={styles.rows}>
        {rows.map((row) => {
          const override = overrideBySymbol.get(row.symbol);
          return (
            <div className={styles.row} key={row.symbol}>
              <div className={styles.identity}>
                <strong>{row.symbol}</strong>
                <span>{row.name}</span>
                <small>{money(row.value)}</small>
              </div>
              <div className={styles.control}>
                <label>
                  <span className="visuallyHidden">Sector for {row.symbol}</span>
                  <select
                    value={override ?? row.sector}
                    disabled={busy === row.symbol}
                    onChange={(event) => void save(row.symbol, event.target.value as Sector)}
                  >
                    {SECTORS.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
                  </select>
                </label>
                {override ? (
                  <button type="button" className={styles.reset} disabled={busy === row.symbol} onClick={() => void save(row.symbol, null)}>
                    Reset
                  </button>
                ) : <span className={styles.auto}>auto</span>}
              </div>
            </div>
          );
        })}
        {!rows.length ? <p className="empty">No holdings to classify.</p> : null}
      </div>
    </Card>
  );
}
