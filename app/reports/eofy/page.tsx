"use client";

import { useEffect, useMemo, useState } from "react";
import type { EofyReport } from "@/lib/reports/eofy";
import { Card, Notice } from "@/northstar/components";

const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

const moneyOrDash = (value: number | null | undefined) => value == null ? "n/a" : money(value);

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

function setUrl(year: number) {
  const url = new URL(window.location.href);
  url.searchParams.set("scope", "personal");
  url.searchParams.set("year", String(year));
  window.history.replaceState(null, "", url);
}

async function loadReport(year: number): Promise<EofyReport> {
  const response = await fetch(`/api/reports/eofy?scope=personal&year=${year}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load EOFY report");
  return payload as EofyReport;
}

function tone(value: number) {
  return value >= 0 ? "positive" : "negative";
}

function reconciliationTone(status: EofyReport["reconciliation"]["status"]) {
  if (status === "review") return "negative";
  if (status === "ok") return "positive";
  return "";
}

function total<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((sum, row) => sum + pick(row), 0);
}

export default function EofyReportPage() {
  const [year, setYear] = useState(defaultFinancialYearEnding());
  const [data, setData] = useState<EofyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const years = useMemo(() => yearOptions(year), [year]);

  useEffect(() => {
    setYear(yearFromLocation());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const report = await loadReport(year);
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
  }, [year]);

  const chooseYear = (next: number) => {
    setYear(next);
    setUrl(next);
  };

  return (
    <main className="printReportShell">
      <nav className="printReportToolbar screenOnly" aria-label="Report actions">
        <a className="miniBrand" href="/reports"><span className="miniStar" aria-hidden="true">✦</span><span>Reports</span></a>
        <span className="reportScopePill">Personal only</span>
        <label className="yearSelect">
          <span>Financial year</span>
          <select value={year} onChange={(event) => chooseYear(Number(event.target.value))}>
            {years.map((item) => <option key={item} value={item}>FY{item}</option>)}
          </select>
        </label>
        <div className="printReportActions">
          <a className="button primary" href={`/api/reports/eofy?scope=personal&year=${year}&format=xlsx`}>Download XLSX</a>
          <a className="button" href={`/api/reports/eofy?scope=personal&year=${year}&format=csv`}>Download CSV</a>
          <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
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
              <h2>Personal Account Coverage</h2>
              <span>{data.accountSummaries.length} broker account{data.accountSummaries.length === 1 ? "" : "s"} included</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Broker</th>
                  <th>Account</th>
                  <th className="numeric">Trades</th>
                  <th className="numeric">Income</th>
                  <th className="numeric">Buy cost</th>
                  <th className="numeric">Sell proceeds</th>
                  <th className="numeric">Current value</th>
                </tr>
              </thead>
              <tbody>
                {data.accountSummaries.map((row) => (
                  <tr key={`${row.broker}-${row.accountKey}`}>
                    <td>{row.broker}</td>
                    <td><strong>{row.accountKey}</strong><span>{row.currentHoldings} current holding{row.currentHoldings === 1 ? "" : "s"}</span></td>
                    <td className="numeric">{row.tradeMovements}<span>{row.buyTrades} buy · {row.sellTrades} sell</span></td>
                    <td className="numeric">{row.incomePayments}<span>{money(row.netIncomeAud)} net</span></td>
                    <td className="numeric">{money(row.buysAud)}</td>
                    <td className="numeric">{money(row.sellsAud)}</td>
                    <td className="numeric">{money(row.currentMarketValueAud)}</td>
                  </tr>
                ))}
                {!data.accountSummaries.length ? <tr><td colSpan={7} className="emptyCell">No Personal broker account activity stored for this financial year.</td></tr> : null}
              </tbody>
            </table>
          </section>

          <section className="printReportSection">
            <div className="printSectionHeader">
              <h2>Accountant Reconciliation</h2>
              <span className={reconciliationTone(data.reconciliation.status)}>{data.reconciliation.status.toUpperCase()} · tolerance AUD {data.reconciliation.varianceToleranceAud.toFixed(2)}</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Check</th>
                  <th className="numeric">NorthStar</th>
                  <th className="numeric">Reference</th>
                  <th className="numeric">Variance</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.reconciliation.rows.map((row) => (
                  <tr key={`${row.section}-${row.check}`}>
                    <td>{row.section}</td>
                    <td><strong>{row.check}</strong></td>
                    <td className="numeric">{moneyOrDash(row.reportedAud)}</td>
                    <td className="numeric">{moneyOrDash(row.referenceAud)}</td>
                    <td className={`numeric ${row.varianceAud == null ? "" : tone(row.varianceAud)}`}>{moneyOrDash(row.varianceAud)}</td>
                    <td className={reconciliationTone(row.status)}>{row.status.toUpperCase()}</td>
                    <td>{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="printReportSection">
            <div className="printSectionHeader">
              <h2>Australian CGT Summary</h2>
              <span>Sharesight-style 18H / 18A flow</span>
            </div>
            <div className="printMiniGrid">
              <div><span>Short term gains</span><strong>{money(data.capitalGains.summary.shortTermGainsAud)}</strong></div>
              <div><span>Long term gains</span><strong>{money(data.capitalGains.summary.longTermGainsAud)}</strong></div>
              <div><span>Capital losses</span><strong className="negative">{money(data.capitalGains.summary.lossesAud)}</strong></div>
              <div><span>Total current year gains 18H</span><strong>{money(data.capitalGains.summary.totalCurrentYearCapitalGainsAud)}</strong></div>
              <div><span>Post-loss long term gains</span><strong>{money(data.capitalGains.summary.longTermGainsAfterLossesAud)}</strong></div>
              <div><span>CGT concession</span><strong className="negative">-{money(data.capitalGains.summary.cgtConcessionAud)}</strong><em>{Math.round(data.capitalGains.summary.discountRate * 100)}% discount</em></div>
              <div><span>Total net capital gain 18A</span><strong className={tone(data.capitalGains.summary.netCapitalGainAud)}>{money(data.capitalGains.summary.netCapitalGainAud)}</strong></div>
              <div><span>Sale allocation</span><strong>FIFO</strong><em>Minimise CGT override not yet modelled</em></div>
            </div>
          </section>

          <section className="printReportSection">
            <div className="printSectionHeader">
              <h2>Taxable Income Classification</h2>
              <span>Australian non-trust, trust and foreign income</span>
            </div>
            <div className="printMiniGrid">
              <div><span>AU non-trust</span><strong>{money(total(data.taxableIncome.australianNonTrust, (row) => row.totalIncomeAud))}</strong><em>{data.taxableIncome.australianNonTrust.length} row{data.taxableIncome.australianNonTrust.length === 1 ? "" : "s"}</em></div>
              <div><span>AU trust / ETF-like</span><strong>{money(total(data.taxableIncome.australianTrust, (row) => row.totalIncomeAud))}</strong><em>{data.taxableIncome.australianTrust.length} row{data.taxableIncome.australianTrust.length === 1 ? "" : "s"}</em></div>
              <div><span>Foreign income</span><strong>{money(total(data.taxableIncome.foreign, (row) => row.grossAmountAud))}</strong><em>{money(total(data.taxableIncome.foreign, (row) => row.foreignTaxWithheldAud))} tax withheld</em></div>
            </div>
          </section>

          <section className="printReportSection">
            <div className="printSectionHeader">
              <h2>Capital Gains By Holding</h2>
              <span>All holdings schedule</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th>Market</th>
                  <th className="numeric">Sold qty</th>
                  <th className="numeric">Short term</th>
                  <th className="numeric">Long term</th>
                  <th className="numeric">Losses</th>
                  <th className="numeric">Total gains</th>
                </tr>
              </thead>
              <tbody>
                {data.capitalGains.byHolding.map((row) => (
                  <tr key={`${row.market}-${row.code}`}>
                    <td><strong>{row.code}</strong><span>{row.name}</span></td>
                    <td>{row.market}</td>
                    <td className="numeric">{number(row.soldQuantity)}</td>
                    <td className="numeric">{money(row.shortTermGainsAud)}</td>
                    <td className="numeric">{money(row.longTermGainsAud)}</td>
                    <td className={`numeric ${tone(row.lossesAud)}`}>{money(row.lossesAud)}</td>
                    <td className="numeric">{money(row.totalGainAud)}</td>
                  </tr>
                ))}
                {!data.capitalGains.byHolding.length ? <tr><td colSpan={7} className="emptyCell">No realised capital gains/losses stored for this owner and financial year.</td></tr> : null}
              </tbody>
            </table>
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
                    <td>{row.broker}<span>{row.accountKey}</span></td>
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
                    <td>{row.broker}<span>{row.accountKey}</span></td>
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
              <h2>Historical Cost Movement</h2>
              <span>Opening, purchases, cost of sales and stored EOFY valuation</span>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th>Market</th>
                  <th className="numeric">Opening qty</th>
                  <th className="numeric">Opening cost</th>
                  <th className="numeric">Purchases</th>
                  <th className="numeric">Cost of sales</th>
                  <th className="numeric">Closing qty</th>
                  <th className="numeric">Closing cost</th>
                  <th className="numeric">Closing value</th>
                </tr>
              </thead>
              <tbody>
                {data.historicalCost.map((row) => (
                  <tr key={`${row.market}-${row.code}`}>
                    <td><strong>{row.code}</strong><span>{row.name}</span></td>
                    <td>{row.market}</td>
                    <td className="numeric">{number(row.openingQuantity)}</td>
                    <td className="numeric">{money(row.openingBalanceAud)}</td>
                    <td className="numeric">{money(row.purchasesAud)}</td>
                    <td className="numeric">{money(row.costOfSalesAud)}</td>
                    <td className="numeric">{number(row.closingQuantity)}</td>
                    <td className="numeric">{money(row.closingBalanceAud)}</td>
                    <td className="numeric">
                      {row.closingMarketValueAud == null ? "Not stored" : money(row.closingMarketValueAud)}
                      <span>{row.closingPriceDate ? `${row.closingPriceDate} · ${row.closingValuationStatus}` : row.closingValuationStatus}</span>
                    </td>
                  </tr>
                ))}
                {!data.historicalCost.length ? <tr><td colSpan={9} className="emptyCell">No cost movement rows could be built from stored transactions.</td></tr> : null}
              </tbody>
            </table>
          </section>

          <section className="printReportSection printBreakBefore">
            <div className="printSectionHeader">
              <h2>Unrealised CGT Reference</h2>
              <span>Open lots repriced to EOFY where stored prices are available</span>
            </div>
            <div className="printMiniGrid">
              <div><span>Short term unrealised gains</span><strong>{money(data.unrealisedCgt.summary.shortTermGainsAud)}</strong><em>{data.unrealisedCgt.shortTerm.length} lots</em></div>
              <div><span>Long term unrealised gains</span><strong>{money(data.unrealisedCgt.summary.longTermGainsAud)}</strong><em>{data.unrealisedCgt.longTerm.length} lots</em></div>
              <div><span>Unrealised losses</span><strong className="negative">{money(data.unrealisedCgt.summary.lossesAud)}</strong><em>{data.unrealisedCgt.losses.length} lots</em></div>
            </div>
            <table className="printReportTable">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Holding</th>
                  <th>Purchase date</th>
                  <th className="numeric">Quantity</th>
                  <th className="numeric">Cost base</th>
                  <th className="numeric">Market value</th>
                  <th className="numeric">Gain / loss</th>
                  <th>As of</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...data.unrealisedCgt.shortTerm.map((row) => ({ bucket: "Short term", row })),
                  ...data.unrealisedCgt.longTerm.map((row) => ({ bucket: "Long term", row })),
                  ...data.unrealisedCgt.losses.map((row) => ({ bucket: "Loss", row })),
                ].map(({ bucket, row }) => (
                  <tr key={`${bucket}-${row.id}`}>
                    <td>{bucket}</td>
                    <td><strong>{row.symbol}</strong><span>{row.name}</span></td>
                    <td>{dateLabel(row.acquisitionDate)}</td>
                    <td className="numeric">{number(row.quantity)}</td>
                    <td className="numeric">{money(row.costAud)}</td>
                    <td className="numeric">{money(row.marketValueAud)}</td>
                    <td className={`numeric ${tone(row.unrealisedGainAud)}`}>{signedMoney(row.unrealisedGainAud)}</td>
                    <td>{dateLabel(row.asOfDate)}<span>{row.note}</span></td>
                  </tr>
                ))}
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
                    <td>{row.broker}<span>{row.accountKey}</span></td>
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
