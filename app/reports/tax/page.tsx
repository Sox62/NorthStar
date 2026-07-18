"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardData, Scope } from "@/lib/storage";
import type { TaxLotsResponse } from "@/lib/tax-lots";
import { Card, Notice } from "@/northstar/components";

const scopes: Array<{ key: Scope; label: string }> = [
  { key: "overall", label: "Overall" },
  { key: "personal", label: "Personal" },
  { key: "smsf", label: "SMSF" },
];

const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

const signedMoney = (value: number) => `${value >= 0 ? "+" : ""}${money(value)}`;

const number = (value: number) =>
  new Intl.NumberFormat("en-AU", { maximumFractionDigits: 4 }).format(value);

const percent = (value: number | null | undefined) =>
  value == null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;

const dateLabel = (value: string | null | undefined) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "Unknown";

function scopeFromLocation(): Scope {
  if (typeof window === "undefined") return "overall";
  const requested = new URL(window.location.href).searchParams.get("scope");
  return requested === "personal" || requested === "smsf" ? requested : "overall";
}

function scopeTitle(scope: Scope) {
  if (scope === "personal") return "Personal Tax Report";
  if (scope === "smsf") return "SMSF Tax Report";
  return "Consolidated Tax Report";
}

function heldLabel(days: number | null) {
  if (days == null) return "Unknown";
  if (days < 365) return `${days}d`;
  return `${Math.floor(days / 365)}y ${days % 365}d`;
}

async function loadDashboard(scope: Scope): Promise<DashboardData> {
  const response = await fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load dashboard");
  return payload as DashboardData;
}

async function loadTaxLots(scope: Scope): Promise<TaxLotsResponse> {
  const response = await fetch(`/api/tax-lots?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load tax lots");
  return payload as TaxLotsResponse;
}

function setUrlScope(scope: Scope) {
  const url = new URL(window.location.href);
  url.searchParams.set("scope", scope);
  window.history.replaceState(null, "", url);
}

export default function TaxReportPage() {
  const [scope, setScope] = useState<Scope>("overall");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [taxLots, setTaxLots] = useState<TaxLotsResponse | null>(null);
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
        const [dashboardResult, taxResult] = await Promise.all([loadDashboard(scope), loadTaxLots(scope)]);
        if (!cancelled) {
          setDashboard(dashboardResult);
          setTaxLots(taxResult);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load tax report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const openLots = useMemo(() => taxLots?.openLots ?? [], [taxLots]);
  const realisedLots = useMemo(() => taxLots?.realisedLots ?? [], [taxLots]);
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
          <a className="button" href={`/api/reports/tax-position?scope=${scope}`}>Download CSV</a>
          <button className="primary" type="button" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </nav>

      {loading ? (
        <Card><p className="empty">Loading tax report...</p></Card>
      ) : error ? (
        <Notice tone="error" title="Unable to load tax report">{error}</Notice>
      ) : dashboard && taxLots ? (
        <article className="printReportPage">
          <header className="printReportHeader">
            <div>
              <p>NorthStar</p>
              <h1>{scopeTitle(scope)}</h1>
              <span>Generated {dateLabel(generatedAt)} · Position date {dateLabel(taxLots.asOfDate)}</span>
            </div>
            <strong>{signedMoney(taxLots.summary.taxableGainIfSoldAud)}</strong>
          </header>

          <section className="printKpiGrid">
            <div><span>Open lots</span><strong>{taxLots.summary.openLots}</strong></div>
            <div><span>Unrealised gain</span><strong className={taxLots.summary.unrealisedGainAud >= 0 ? "positive" : "negative"}>{signedMoney(taxLots.summary.unrealisedGainAud)}</strong></div>
            <div><span>Taxable if sold</span><strong className={taxLots.summary.taxableGainIfSoldAud >= 0 ? "positive" : "negative"}>{signedMoney(taxLots.summary.taxableGainIfSoldAud)}</strong></div>
            <div><span>Eligible gains</span><strong>{money(taxLots.summary.unrealisedDiscountEligibleGainAud)}</strong></div>
            <div><span>Net realised</span><strong className={taxLots.summary.netRealisedAud >= 0 ? "positive" : "negative"}>{signedMoney(taxLots.summary.netRealisedAud)}</strong></div>
            <div><span>Taxable realised</span><strong className={taxLots.summary.taxableRealisedAud >= 0 ? "positive" : "negative"}>{signedMoney(taxLots.summary.taxableRealisedAud)}</strong></div>
          </section>

          <section className="printReportSection">
            <div className="printSectionHeader">
              <h2>Income And Credits</h2>
              <span>Trailing 12 months</span>
            </div>
            <div className="printMiniGrid">
              <div><span>Net dividend income</span><strong>{money(dashboard.income.netCashAud)}</strong><em>{dashboard.income.dividendCount} payments</em></div>
              <div><span>Franking credits</span><strong>{money(dashboard.income.frankingCreditsAud)}</strong><em>Stored where supplied by import</em></div>
              <div><span>Foreign withholding</span><strong>{money(dashboard.income.taxWithheldAud)}</strong><em>Imported tax withheld</em></div>
              <div><span>Gross-up yield</span><strong>{percent(dashboard.income.grossedUpYieldPercent)}</strong><em>Against current NAV</em></div>
            </div>
          </section>

          <section className="printReportSection printBreakBefore">
            <div className="printSectionHeader">
              <h2>Open CGT Lots</h2>
              <span>{openLots.length} lots</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th>Owner</th>
                  <th>Acquired</th>
                  <th>Held</th>
                  <th className="numeric">Units</th>
                  <th className="numeric">Cost</th>
                  <th className="numeric">Value</th>
                  <th className="numeric">Unrealised</th>
                  <th>Discount</th>
                  <th className="numeric">Taxable</th>
                </tr>
              </thead>
              <tbody>
                {openLots.map((lot) => (
                  <tr key={lot.id}>
                    <td><strong>{lot.symbol}</strong><span>{lot.name}</span></td>
                    <td>{lot.ownerLabel}</td>
                    <td>{dateLabel(lot.acquisitionDate)}</td>
                    <td>{heldLabel(lot.heldDays)}</td>
                    <td className="numeric">{number(lot.quantity)}</td>
                    <td className="numeric">{money(lot.costAud)}</td>
                    <td className="numeric">{money(lot.marketValueAud)}</td>
                    <td className={`numeric ${lot.unrealisedGainAud >= 0 ? "positive" : "negative"}`}>{signedMoney(lot.unrealisedGainAud)}</td>
                    <td>{lot.discountEligible ? `${Math.round(lot.discountRate * 100)}% eligible` : "No"}</td>
                    <td className={`numeric ${lot.taxableGainIfSoldAud >= 0 ? "positive" : "negative"}`}>{signedMoney(lot.taxableGainIfSoldAud)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="printReportSection printBreakBefore">
            <div className="printSectionHeader">
              <h2>Realised Sales</h2>
              <span>{realisedLots.length} lots</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Sale</th>
                  <th>Owner</th>
                  <th>Acquired</th>
                  <th>Sold</th>
                  <th className="numeric">Units</th>
                  <th className="numeric">Proceeds</th>
                  <th className="numeric">Cost</th>
                  <th className="numeric">Realised</th>
                  <th>Discount</th>
                  <th className="numeric">Taxable</th>
                </tr>
              </thead>
              <tbody>
                {realisedLots.map((lot) => (
                  <tr key={lot.id}>
                    <td><strong>{lot.symbol}</strong><span>{lot.note}</span></td>
                    <td>{lot.ownerLabel}</td>
                    <td>{dateLabel(lot.acquisitionDate)}</td>
                    <td>{dateLabel(lot.saleDate)}</td>
                    <td className="numeric">{number(lot.quantity)}</td>
                    <td className="numeric">{money(lot.proceedsAud)}</td>
                    <td className="numeric">{money(lot.costAud)}</td>
                    <td className={`numeric ${lot.realisedGainAud >= 0 ? "positive" : "negative"}`}>{signedMoney(lot.realisedGainAud)}</td>
                    <td>{lot.discountEligible ? `${Math.round(lot.discountRate * 100)}% eligible` : "No"}</td>
                    <td className={`numeric ${lot.taxableGainAud >= 0 ? "positive" : "negative"}`}>{signedMoney(lot.taxableGainAud)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </article>
      ) : null}
    </main>
  );
}
