"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardData, Scope } from "@/lib/storage";
import { sectorForInstrument } from "@/northstar/lib/sector-map";
import { Card, Notice } from "@/northstar/components";

const scopes: Array<{ key: Scope; label: string }> = [
  { key: "overall", label: "Overall" },
  { key: "personal", label: "Personal" },
  { key: "smsf", label: "SMSF" },
];

const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

const signedMoney = (value: number) => `${value >= 0 ? "+" : ""}${money(value)}`;

const percent = (value: number | null | undefined) =>
  value == null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;

const dateLabel = (value: string | null | undefined) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "Not recorded";

function scopeFromLocation(): Scope {
  if (typeof window === "undefined") return "overall";
  const requested = new URL(window.location.href).searchParams.get("scope");
  return requested === "personal" || requested === "smsf" ? requested : "overall";
}

function scopeTitle(scope: Scope) {
  if (scope === "personal") return "Personal Wealth Statement";
  if (scope === "smsf") return "SMSF Wealth Statement";
  return "Consolidated Wealth Statement";
}

async function loadDashboard(scope: Scope): Promise<DashboardData> {
  const response = await fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load wealth report");
  return payload as DashboardData;
}

function setUrlScope(scope: Scope) {
  const url = new URL(window.location.href);
  url.searchParams.set("scope", scope);
  window.history.replaceState(null, "", url);
}

export default function WealthReportPage() {
  const [scope, setScope] = useState<Scope>("overall");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setScope(scopeFromLocation());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await loadDashboard(scope);
        if (!cancelled) setData(result);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load wealth report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const holdings = useMemo(() => data?.holdings.filter((holding) => holding.marketValueAud || holding.costAud).sort((a, b) => b.marketValueAud - a.marketValueAud) ?? [], [data]);
  const generatedAt = new Date().toISOString();

  const chooseScope = (next: Scope) => {
    setScope(next);
    setUrlScope(next);
  };

  return (
    <main className="printReportShell">
      <nav className="printReportToolbar screenOnly" aria-label="Report actions">
        <a className="miniBrand" href="/reports"><span className="miniStar" aria-hidden="true">✦</span><span>Reports</span></a>
        <div className="scopeSwitch" role="tablist" aria-label="Report scope">
          {scopes.map((item) => (
            <button key={item.key} type="button" className={scope === item.key ? "isActive" : ""} onClick={() => chooseScope(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="printReportActions">
          <a className="button" href={`/api/reports/wealth-statement?scope=${scope}`}>Download CSV</a>
          <button className="primary" type="button" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </nav>

      {loading ? (
        <Card><p className="empty">Loading wealth report...</p></Card>
      ) : error ? (
        <Notice tone="error" title="Unable to load wealth report">{error}</Notice>
      ) : data ? (
        <article className="printReportPage">
          <header className="printReportHeader">
            <div>
              <p>NorthStar</p>
              <h1>{scopeTitle(scope)}</h1>
              <span>Generated {dateLabel(generatedAt)} · Valuations {dateLabel(data.lastUpdated)}</span>
            </div>
            <strong>{money(data.totalValue)}</strong>
          </header>

          <section className="printKpiGrid">
            <div><span>Invested</span><strong>{money(data.investedValue)}</strong></div>
            <div><span>Cash</span><strong>{money(data.cashValue)}</strong></div>
            <div><span>Total P/L</span><strong className={data.totalReturn >= 0 ? "positive" : "negative"}>{signedMoney(data.totalReturn)}</strong></div>
            <div><span>Return on cost</span><strong>{percent(data.totalReturnPercent)}</strong></div>
            <div><span>Daily P/L</span><strong className={data.dailyMovement >= 0 ? "positive" : "negative"}>{signedMoney(data.dailyMovement)}</strong></div>
            <div><span>XIRR</span><strong>{percent(data.xirr.valuePercent)}</strong></div>
          </section>

          <section className="printReportSection">
            <div className="printSectionHeader">
              <h2>Performance And Income</h2>
              <span>{data.periodReturns.length} return periods</span>
            </div>
            <div className="printMiniGrid">
              {data.periodReturns.map((item) => (
                <div key={item.key}>
                  <span>{item.label}</span>
                  <strong className={(item.valueAud ?? 0) >= 0 ? "positive" : "negative"}>{percent(item.valuePercent)}</strong>
                  <em>{item.valueAud == null ? item.note : `${signedMoney(item.valueAud)} NAV`}</em>
                </div>
              ))}
              <div>
                <span>Trailing income</span>
                <strong>{money(data.income.netCashAud)}</strong>
                <em>{money(data.income.frankingCreditsAud)} franking · {percent(data.income.grossedUpYieldPercent)} gross-up yield</em>
              </div>
            </div>
          </section>

          <section className="printReportSection">
            <div className="printSectionHeader">
              <h2>Allocation</h2>
              <span>Current market value</span>
            </div>
            <div className="printAllocationGrid">
              <div>
                <h3>Asset Allocation</h3>
                {data.allocations.slice(0, 10).map((item) => (
                  <div className="printBarRow" key={item.name}>
                    <span>{item.name}</span>
                    <i><b style={{ width: `${Math.max(2, item.value)}%` }} /></i>
                    <strong>{money(item.amount)} <em>{item.value.toFixed(1)}%</em></strong>
                  </div>
                ))}
              </div>
              <div>
                <h3>Currency Exposure</h3>
                {data.currencyExposure.slice(0, 8).map((item) => (
                  <div className="printBarRow" key={item.currency}>
                    <span>{item.currency}</span>
                    <i><b style={{ width: `${Math.max(2, item.valuePercent)}%` }} /></i>
                    <strong>{money(item.amountAud)} <em>{item.valuePercent.toFixed(1)}%</em></strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="printReportSection printBreakBefore">
            <div className="printSectionHeader">
              <h2>Holdings</h2>
              <span>{holdings.length} positions</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th>Owner</th>
                  <th>Sector</th>
                  <th className="numeric">Value</th>
                  <th className="numeric">Weight</th>
                  <th className="numeric">Cost</th>
                  <th className="numeric">P/L</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding) => (
                  <tr key={holding.id}>
                    <td><strong>{holding.symbol}</strong><span>{holding.name}</span></td>
                    <td>{holding.ownerType === "SMSF" ? "SMSF" : "Personal"}</td>
                    <td>{sectorForInstrument(holding)}</td>
                    <td className="numeric">{money(holding.marketValueAud)}</td>
                    <td className="numeric">{holding.weight.toFixed(1)}%</td>
                    <td className="numeric">{money(holding.costAud)}</td>
                    <td className={`numeric ${holding.pnlAud >= 0 ? "positive" : "negative"}`}>{signedMoney(holding.pnlAud)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="printReportSection">
            <div className="printSectionHeader">
              <h2>Accounts</h2>
              <span>{data.accounts.length} references</span>
            </div>
            <div className="printAccountList">
              {data.accounts.map((account, index) => (
                <div key={`${account.name}-${index}`}>
                  <strong>{account.name}</strong>
                  <span>{account.detail}</span>
                  <em>{account.status}</em>
                </div>
              ))}
            </div>
          </section>
        </article>
      ) : null}
    </main>
  );
}
