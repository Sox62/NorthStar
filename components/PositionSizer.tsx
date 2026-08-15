"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, Notice, StatusBadge } from "@/northstar/components";
import { deriveSize, preTradeChecks, sizerVerdict } from "@/northstar/lib/position-sizer";
import type { Holding } from "@/northstar/types";
import { dashboardToNorthstarHoldings } from "./northstar-adapter";
import styles from "./PositionSizer.module.css";

type Scope = "personal" | "smsf";
type Loaded = {
  holdings: Holding[];
  navByScope: Record<Scope, number>;
  cashByScope: Record<Scope, number>;
};

const RISK_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2];
const MAX_POSITION_PERCENT = 20;

const aud = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

async function loadScope(scope: Scope) {
  const response = await fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load dashboard");
  return payload;
}

export default function PositionSizer() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [account, setAccount] = useState<Scope>("smsf");
  const [ticker, setTicker] = useState("");
  const [riskPercent, setRiskPercent] = useState(1);
  const [entry, setEntry] = useState("");
  const [invalidation, setInvalidation] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [personal, smsf] = await Promise.all([loadScope("personal"), loadScope("smsf")]);
        if (cancelled) return;
        setData({
          holdings: [...dashboardToNorthstarHoldings(personal), ...dashboardToNorthstarHoldings(smsf)],
          navByScope: { personal: personal.totalValue ?? 0, smsf: smsf.totalValue ?? 0 },
          cashByScope: { personal: personal.cashValue ?? 0, smsf: smsf.cashValue ?? 0 },
        });
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load portfolio");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const familyNav = (data?.navByScope.personal ?? 0) + (data?.navByScope.smsf ?? 0);
  const availableCash = data?.cashByScope[account] ?? 0;

  // Theme exposure is measured family-wide: a sector cap is about total exposure, not per account.
  const match = useMemo(
    () => data?.holdings.find((holding) => holding.symbol.toUpperCase() === ticker.trim().toUpperCase()) ?? null,
    [data, ticker],
  );
  const themeValue = useMemo(() => {
    if (!data || !match) return 0;
    return data.holdings
      .filter((holding) => holding.sector === match.sector)
      .reduce((sum, holding) => sum + holding.marketValueAud, 0);
  }, [data, match]);

  const input = {
    familyNavAud: familyNav,
    riskPercent,
    entryAud: Number(entry) || 0,
    invalidationAud: Number(invalidation) || 0,
    availableCashAud: availableCash,
    themeValueAud: themeValue,
    themeTargetPercent: null,
    maxPositionPercent: MAX_POSITION_PERCENT,
  };
  const result = deriveSize(input);
  const checks = preTradeChecks(input, result);
  const verdict = sizerVerdict(checks, result);

  const outputs = [
    { key: "risk", label: "Capital at risk", value: aud(result.riskBudgetAud), note: `${riskPercent}% of family NAV` },
    { key: "stop", label: "Stop distance", value: result.stopDistanceAud ? `${result.stopDistancePercent.toFixed(2)}%` : "-", note: result.stopDistanceAud ? `${aud(result.stopDistanceAud)} per unit` : "Set entry and invalidation" },
    { key: "units", label: "Position size", value: result.units ? result.units.toLocaleString("en-AU") : "-", note: "whole units" },
    { key: "value", label: "Position value", value: result.positionValueAud ? aud(result.positionValueAud) : "-", note: result.positionValueAud ? `${result.positionPercentOfNav.toFixed(2)}% of family NAV` : "No size yet" },
  ];

  return (
    <main className="shell">
      <PageHeader
        title="Position sizer"
        description="Size follows from dollars at risk and stop distance. Choose the invalidation from the chart first — the stop is never tightened to justify a larger position."
        links={[{ href: "/", label: "State of play" }, { href: "/targets", label: "Armed list" }, { href: "/relative", label: "Relative leadership" }]}
      />

      {error ? <Notice tone="error" title="Unable to load portfolio">{error}</Notice> : null}

      <div className={styles.grid}>
        <Card>
          <p className="eyebrow">Proposed trade</p>
          <h2 className="cardTitle">Inputs</h2>
          <div className={styles.fields}>
            <label>
              <span>Security</span>
              <input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="CDE" />
            </label>
            <label>
              <span>Account</span>
              <select value={account} onChange={(event) => setAccount(event.target.value as Scope)}>
                <option value="smsf">SMSF</option>
                <option value="personal">Personal</option>
              </select>
            </label>
            <label>
              <span>Risk budget — percent of whole-family NAV</span>
              <select value={riskPercent} onChange={(event) => setRiskPercent(Number(event.target.value))}>
                {RISK_OPTIONS.map((option) => <option key={option} value={option}>{option}%</option>)}
              </select>
            </label>
            <label>
              <span>Entry price — AUD</span>
              <input type="number" step="0.01" min="0" value={entry} onChange={(event) => setEntry(event.target.value)} />
            </label>
            <label>
              <span>Technical invalidation — AUD</span>
              <input type="number" step="0.01" min="0" value={invalidation} onChange={(event) => setInvalidation(event.target.value)} />
            </label>
          </div>
          <p className={styles.hint}>
            Family NAV {aud(familyNav)} · {account === "smsf" ? "SMSF" : "Personal"} cash {aud(availableCash)}
            {match ? ` · ${match.sector} exposure ${aud(themeValue)}` : ticker ? " · not currently held" : ""}
          </p>
        </Card>

        <div className={styles.rightColumn}>
          <Card>
            <p className="eyebrow">Derived size</p>
            <div className={styles.outputs}>
              {outputs.map((output) => (
                <div className={styles.output} key={output.key}>
                  <span>{output.label}</span>
                  <strong>{output.value}</strong>
                  <em>{output.note}</em>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <p className="eyebrow">Pre-trade checks</p>
            <div className={styles.checks}>
              {checks.map((check) => (
                <div className={styles.check} key={check.key}>
                  <div>
                    <p className={styles.checkLabel}>{check.label}</p>
                    <p className={styles.checkDetail}>{check.detail}</p>
                  </div>
                  <StatusBadge tone={check.tone}>{check.status}</StatusBadge>
                </div>
              ))}
            </div>
            <div className={styles.verdict}>
              <button className="primary" type="button" disabled={!verdict.armable} title={verdict.armable ? undefined : verdict.text}>
                Arm order
              </button>
              <span>{verdict.text}</span>
            </div>
            <p className={styles.hint}>
              Arming records intent only. NorthStar does not place orders.
            </p>
          </Card>
        </div>
      </div>
    </main>
  );
}
