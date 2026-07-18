"use client";

import { useEffect, useMemo, useState } from "react";
import type { EofyReport, EofyScope } from "@/lib/reports/eofy";
import { Card, Notice } from "@/northstar/components";

const scopes: Array<{ key: EofyScope; label: string }> = [
  { key: "personal", label: "Personal" },
  { key: "smsf", label: "SMSF" },
];

const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

const signedMoney = (value: number) => `${value >= 0 ? "+" : ""}${money(value)}`;

const number = (value: number | null | undefined) =>
  value == null ? "" : new Intl.NumberFormat("en-AU", { maximumFractionDigits: 4 }).format(value);

const dateLabel = (value: string | null | undefined) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "Not recorded";

function defaultFinancialYearEnding() {
  const today = new Date();
  const year = today.getFullYear();
  return today.getMonth() >= 6 ? year : year - 1;
}

function scopeFromLocation(): EofyScope {
  if (typeof window === "undefined") return "personal";
  const requested = new URL(window.location.href).searchParams.get("scope");
  return requested === "smsf" ? "smsf" : "personal";
}

function yearFromLocation() {
  if (typeof window === "undefined") return defaultFinancialYearEnding();
  const requested = Number(new URL(window.location.href).searchParams.get("year"));
  return Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : defaultFinancialYearEnding();
}

function yearOptions(selectedYear: number) {
  const current = defaultFinancialYearEnding();
  const years = new Set([selectedYear, current, current - 1, current - 2, current - 3, current - 4]);
  return [...years].sort((a, b) => b - a);
}

function setUrl(scope: EofyScope, year: number) {
  const url = new URL(window.location.href);
  url.searchParams.set("scope", scope);
  url.searchParams.set("year", String(year));
  window.history.replaceState(null, "", url);
}

async function loadReport(scope: EofyScope, year: number): Promise<EofyReport> {
  const response = await fetch(`/api/reports/eofy?scope=${scope}&year=${year}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load EOFY report");
  return payload as EofyReport;
}

function tone(value: number) {
  return value >= 0 ? "positive" : "negative";
}

export default function EofyReportPage() {
  const [scope, setScope] = useState<EofyScope>("personal");
  const [year, setYear] = useState(defaultFinancialYearEnding());
  const [data, setData] = useState<EofyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const years = useMemo(() => yearOptions(year), [year]);

  useEffect(() => {
    setScope(scopeFromLocation());
    setYear(yearFromLocation());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const report = await loadReport(scope, year);
        if (!cancelled) setData(report);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load EOFY report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [scope, year]);

  const chooseScope = (next: EofyScope) => {
    setScope(next);
    setUrl(next, year);
  };

  const chooseYear = (next: number) => {
    setYear(next);
    setUrl(scope, next);
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
        <label className="yearSelect">
          <span>Financial year</span>
          <select value={year} onChange={(event) => chooseYear(Number(event.target.value))}>
            {years.map((item) => <option key={item} value={item}>FY{item}</option>)}
          </select>
        </label>
        <div className="printReportActions">
          <a className="button" href={`/api/reports/eofy?scope=${scope}&year=${year}&format=csv`}>Download CSV</a>
          <button className="primary" type="button" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </nav>

      {loading ? (
        <Card><p className="empty">Loading EOFY accountant pack...</p></Card>
      ) : error ? (
        <Notice tone="error" title="Unable to load EOFY report">{error}</Notice>
      ) : data ? (
        <article className="printReportPage accountantReportPage">
          <header className="printReportHeader">
            <div>
              <p>NorthStar</p>
              <h1>{data.ownerLabel} EOFY Accountant Pack</h1>
              <span>{data.financialYear.label}: {dateLabel(data.financialYear.startDate)} to {dateLabel(data.financialYear.endDate)} · Generated {dateLabel(data.generatedAt)}</span>
            </div>
            <strong>{signedMoney(data.summary.taxableRealisedAud)}</strong>
          </header>

          <section className="printKpiGrid">
            <div><span>Gross income</span><strong>{money(data.summary.grossIncomeAud)}</strong></div>
            <div><span>Net income</span><strong>{money(data.summary.netIncomeAud)}</strong></div>
            <div><span>Franking credits</span><strong>{money(data.summary.frankingCreditsAud)}</strong></div>
            <div><span>Foreign withholding</span><strong>{money(data.summary.taxWithheldAud)}</strong></div>
            <div><span>Net realised CGT</span><strong className={tone(data.summary.netRealisedAud)}>{signedMoney(data.summary.netRealisedAud)}</strong></div>
            <div><span>Taxable realised CGT</span><strong className={tone(data.summary.taxableRealisedAud)}>{signedMoney(data.summary.taxableRealisedAud)}</strong></div>
            <div><span>Buy trades</span><strong>{data.summary.buyTrades}</strong><em>{money(data.summary.buysAud)} cost</em></div>
            <div><span>Sell trades</span><strong>{data.summary.sellTrades}</strong><em>{money(data.summary.sellsAud)} proceeds</em></div>
            <div><span>Current holdings ref.</span><strong>{data.summary.currentHoldings}</strong><em>{money(data.summary.currentMarketValueAud)} value</em></div>
          </section>

          <section className="printReportSection">
            <div className="printSectionHeader">
              <h2>Income By Holding</h2>
              <span>{data.summary.dividendPayments} payment{data.summary.dividendPayments === 1 ? "" : "s"}</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th className="numeric">Payments</th>
                  <th className="numeric">Gross income</th>
                  <th className="numeric">Net income</th>
                  <th className="numeric">Franking</th>
                  <th className="numeric">Withheld</th>
                  <th className="numeric">Fees</th>
                </tr>
              </thead>
              <tbody>
                {data.incomeBySymbol.map((row) => (
                  <tr key={row.symbol}>
                    <td><strong>{row.symbol}</strong><span>{row.name}</span></td>
                    <td className="numeric">{row.payments}</td>
                    <td className="numeric">{money(row.grossIncomeAud)}</td>
                    <td className="numeric">{money(row.netIncomeAud)}</td>
                    <td className="numeric">{money(row.frankingCreditsAud)}</td>
                    <td className="numeric">{money(row.taxWithheldAud)}</td>
                    <td className="numeric">{money(row.feesAud)}</td>
                  </tr>
                ))}
                {!data.incomeBySymbol.length ? <tr><td colSpan={7} className="emptyCell">No income payments stored for this owner and financial year.</td></tr> : null}
              </tbody>
            </table>
          </section>

          <section className="printReportSection printBreakBefore">
            <div className="printSectionHeader">
              <h2>Payment Detail</h2>
              <span>Dividend and distribution notices</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Holding</th>
                  <th>Broker</th>
                  <th className="numeric">Units</th>
                  <th className="numeric">Gross</th>
                  <th className="numeric">Net</th>
                  <th className="numeric">Franking</th>
                  <th className="numeric">Withheld</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {data.incomePayments.map((row) => (
                  <tr key={row.id}>
                    <td>{dateLabel(row.paymentDate)}<span>{row.exDate ? `Ex ${dateLabel(row.exDate)}` : ""}</span></td>
                    <td><strong>{row.symbol}</strong><span>{row.name}</span></td>
                    <td>{row.broker}</td>
                    <td className="numeric">{number(row.units)}</td>
                    <td className="numeric">{money(row.grossIncomeAud)}</td>
                    <td className="numeric">{money(row.netIncomeAud)}</td>
                    <td className="numeric">{money(row.frankingCreditsAud)}</td>
                    <td className="numeric">{money(row.taxWithheldAud)}</td>
                    <td>{row.source}</td>
                  </tr>
                ))}
                {!data.incomePayments.length ? <tr><td colSpan={9} className="emptyCell">No income payment detail stored.</td></tr> : null}
              </tbody>
            </table>
          </section>

          <section className="printReportSection printBreakBefore">
            <div className="printSectionHeader">
              <h2>Realised CGT</h2>
              <span>{data.summary.realisedLots} realised lot{data.summary.realisedLots === 1 ? "" : "s"}</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th>Acquired</th>
                  <th>Sold</th>
                  <th>Held</th>
                  <th className="numeric">Units</th>
                  <th className="numeric">Proceeds</th>
                  <th className="numeric">Cost base</th>
                  <th className="numeric">Gain / loss</th>
                  <th>Discount</th>
                  <th className="numeric">Taxable</th>
                </tr>
              </thead>
              <tbody>
                {data.realisedLots.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.symbol}</strong><span>{row.name}</span></td>
                    <td>{dateLabel(row.acquisitionDate)}</td>
                    <td>{dateLabel(row.saleDate)}</td>
                    <td>{row.heldDays == null ? "Unknown" : `${row.heldDays}d`}</td>
                    <td className="numeric">{number(row.quantity)}</td>
                    <td className="numeric">{money(row.proceedsAud)}</td>
                    <td className="numeric">{money(row.costAud)}</td>
                    <td className={`numeric ${tone(row.realisedGainAud)}`}>{signedMoney(row.realisedGainAud)}</td>
                    <td>{row.discountEligible ? `${Math.round(row.discountRate * 100)}% eligible` : "No"}</td>
                    <td className={`numeric ${tone(row.taxableGainAud)}`}>{signedMoney(row.taxableGainAud)}</td>
                  </tr>
                ))}
                {!data.realisedLots.length ? <tr><td colSpan={10} className="emptyCell">No realised sale lots stored for this owner and financial year.</td></tr> : null}
              </tbody>
            </table>
          </section>

          <section className="printReportSection printBreakBefore">
            <div className="printSectionHeader">
              <h2>Trade Movements</h2>
              <span>Buys and sells during the financial year</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Holding</th>
                  <th>Broker</th>
                  <th className="numeric">Units</th>
                  <th className="numeric">Gross AUD</th>
                  <th className="numeric">Fees/tax</th>
                  <th className="numeric">Net cash</th>
                </tr>
              </thead>
              <tbody>
                {data.tradeMovements.map((row) => (
                  <tr key={row.id}>
                    <td>{dateLabel(row.tradeDate)}<span>{row.settleDate ? `Settle ${dateLabel(row.settleDate)}` : ""}</span></td>
                    <td>{row.type}</td>
                    <td><strong>{row.symbol}</strong><span>{row.name}</span></td>
                    <td>{row.broker}</td>
                    <td className="numeric">{number(row.quantity)}</td>
                    <td className="numeric">{money(row.grossAud)}</td>
                    <td className="numeric">{money(row.feesAud + row.taxesAud)}</td>
                    <td className="numeric">{money(row.netCashAud)}</td>
                  </tr>
                ))}
                {!data.tradeMovements.length ? <tr><td colSpan={8} className="emptyCell">No buy/sell trade movements stored for this owner and financial year.</td></tr> : null}
              </tbody>
            </table>
          </section>

          <section className="printReportSection printBreakBefore">
            <div className="printSectionHeader">
              <h2>Current Open Positions Reference</h2>
              <span>Latest valuation {dateLabel(data.valuationAsOf)}</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th>Broker</th>
                  <th>Sector</th>
                  <th className="numeric">Units</th>
                  <th className="numeric">Cost base</th>
                  <th className="numeric">Market value</th>
                  <th className="numeric">Unrealised</th>
                  <th>As of</th>
                </tr>
              </thead>
              <tbody>
                {data.currentHoldings.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.symbol}</strong><span>{row.name}</span></td>
                    <td>{row.broker}</td>
                    <td>{row.sector}</td>
                    <td className="numeric">{number(row.quantity)}</td>
                    <td className="numeric">{money(row.costAud)}</td>
                    <td className="numeric">{money(row.marketValueAud)}</td>
                    <td className={`numeric ${tone(row.unrealisedAud)}`}>{signedMoney(row.unrealisedAud)}</td>
                    <td>{dateLabel(row.asOfDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="printReportSection">
            <div className="printSectionHeader">
              <h2>Data Quality Notes</h2>
              <span>For accountant review</span>
            </div>
            <ul className="printFootnoteList">
              {data.dataQuality.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </section>
        </article>
      ) : null}
    </main>
  );
}
