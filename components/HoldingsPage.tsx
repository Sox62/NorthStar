"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import type { DashboardData, DashboardHolding, Scope } from "@/lib/storage";
import { Card, Notice, StatusBadge, SummaryGrid } from "@/northstar/components";
import { sectorForInstrument } from "@/northstar/lib/sector-map";

type DashboardMap = Partial<Record<Scope, DashboardData>>;

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

const price = (value: number | null, currency: string) =>
  value == null
    ? "No price"
    : `${currency} ${value.toLocaleString("en-AU", {
      minimumFractionDigits: value >= 100 ? 2 : 3,
      maximumFractionDigits: value >= 100 ? 2 : 4,
    })}`;

const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;

function dailyPercent(holding: DashboardHolding) {
  const previousValue = holding.marketValueAud - holding.dayGainAud;
  return previousValue ? holding.dayGainAud / previousValue * 100 : null;
}

const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "Not recorded";

async function loadDashboard(scope: Scope): Promise<DashboardData> {
  const response = await fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load holdings");
  return payload as DashboardData;
}

function includesQuery(holding: DashboardHolding, query: string) {
  const text = `${holding.symbol} ${holding.name} ${holding.ownerType} ${holding.exchange} ${holding.currency} ${holding.assetClass}`.toLowerCase();
  return text.includes(query.toLowerCase());
}

function pnlTone(value: number) {
  return value >= 0 ? "positive" : "negative";
}

const tradingViewOverrides: Record<string, string> = {
  "CDE:US": "NYSE:CDE",
  "XOM:US": "NYSE:XOM",
  "EC:US": "NYSE:EC",
  "HL:US": "NYSE:HL",
  "AG:US": "NYSE:AG",
  "NEM:US": "NYSE:NEM",
  "PAAS:US": "NASDAQ:PAAS",
  "GDX:US": "AMEX:GDX",
  "SIL:US": "AMEX:SIL",
  "SILJ:US": "AMEX:SILJ",
  "URNM:US": "AMEX:URNM",
  "URA:US": "AMEX:URA",
  "UUUU:US": "AMEX:UUUU",
};

function tradingViewSymbol(holding: DashboardHolding) {
  const symbol = holding.symbol.toUpperCase();
  const exchange = holding.exchange.toUpperCase();
  const key = `${symbol}:${exchange}`;
  if (tradingViewOverrides[key]) return tradingViewOverrides[key];
  if (exchange.includes("ASX")) return `ASX:${symbol}`;
  if (exchange.includes("TSXV") || exchange.includes("VENTURE")) return `TSXV:${symbol}`;
  if (exchange.includes("TSX") || exchange.includes("CA")) return `TSX:${symbol}`;
  if (exchange.includes("LSE") || exchange.includes("GB")) return `LSE:${symbol}`;
  if (exchange === "US") return symbol;
  return `${exchange || "ASX"}:${symbol}`;
}

function tradingViewUrl(holding: DashboardHolding) {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tradingViewSymbol(holding))}`;
}

export default function HoldingsPage() {
  const [dashboards, setDashboards] = useState<DashboardMap>({});
  const [scope, setScope] = useState<Scope>("overall");
  const [query, setQuery] = useState("");
  const [chartHolding, setChartHolding] = useState<DashboardHolding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [overall, personal, smsf] = await Promise.all(scopes.map((item) => loadDashboard(item.key)));
        if (!cancelled) setDashboards({ overall, personal, smsf });
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load holdings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = dashboards[scope];
  const accountRows = useMemo(() => {
    return [dashboards.personal, dashboards.smsf].filter((item): item is DashboardData => Boolean(item));
  }, [dashboards.personal, dashboards.smsf]);

  const rows = useMemo(() => {
    const holdings = selected?.holdings ?? [];
    return holdings
      .filter((holding) => !query.trim() || includesQuery(holding, query.trim()))
      .sort((left, right) => right.marketValueAud - left.marketValueAud);
  }, [selected, query]);

  const fallbackCount = rows.filter((holding) => holding.valuationBasis === "cost_basis").length;
  const scopeLabel = scopes.find((item) => item.key === scope)?.label ?? "Overall";

  useEffect(() => {
    if (chartHolding && !rows.some((holding) => holding.id === chartHolding.id)) setChartHolding(null);
  }, [rows, chartHolding]);

  return (
    <main className="shell">
      <PageHeader
        title="Holdings"
        description="Review the full live position book by legal owner, valuation basis, weight and unrealised return."
        links={[
          { href: "/", label: "Dashboard" },
          { href: "/sync", label: "Sync" },
          { href: "/tax", label: "Tax lots" },
          { href: "/reports", label: "Reports" },
          { href: "/roadmap", label: "Roadmap" },
        ]}
      />

      {loading ? (
        <Card><p className="empty">Loading holdings...</p></Card>
      ) : error ? (
        <Notice tone="error" title="Unable to load holdings">{error}</Notice>
      ) : selected ? (
        <>
          <section className="holdingsAccounts">
            {accountRows.map((account) => (
              <Card className="accountSnapshot" key={account.scope}>
                <div className="panelHeader">
                  <div>
                    <p className="eyebrow">{account.scope === "smsf" ? "SMSF" : "Personal"}</p>
                    <h2 className="cardTitle">{money(account.totalValue)}</h2>
                  </div>
                  <StatusBadge tone={account.scope === "smsf" ? "warning" : "good"}>{account.holdings.length} positions</StatusBadge>
                </div>
                <SummaryGrid
                  entries={[
                    ["P/L", money(account.totalReturn)],
                    ["Day P/L", signedMoney(account.dailyMovement)],
                    ["Return", percent(account.totalReturnPercent)],
                    ["Cash", money(account.cashValue)],
                    ["Updated", dateLabel(account.lastUpdated)],
                  ]}
                />
              </Card>
            ))}
          </section>

          <Card className="holdingsBook">
            <div className="panelHeader holdingsHeader">
              <div>
                <p className="eyebrow">Position book</p>
                <h2 className="cardTitle">{scopeLabel} holdings</h2>
              </div>
              <span className="panelCount">{rows.length} of {selected.holdings.length}</span>
            </div>

            <div className="holdingsToolbar">
              <div className="scopeSwitch" role="tablist" aria-label="Holdings scope">
                {scopes.map((item) => (
                  <button key={item.key} type="button" className={scope === item.key ? "isActive" : ""} onClick={() => setScope(item.key)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <label className="holdingsSearch">
                <span>Search holdings</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Symbol, name, owner, currency" />
              </label>
            </div>

            <SummaryGrid
              entries={[
                ["NAV", money(selected.totalValue)],
                ["Day P/L", signedMoney(selected.dailyMovement)],
                ["Invested", money(selected.investedValue)],
                ["Cash", money(selected.cashValue)],
                ["Cost fallback", fallbackCount],
              ]}
            />

            {chartHolding ? <TradingViewPanel holding={chartHolding} /> : null}

            <div className="holdingsTableWrap">
              <table className="holdingsTable">
                <thead>
                  <tr>
                    <th>Holding</th>
                    <th>Owner</th>
                    <th>Sector</th>
                    <th className="numeric">Units</th>
                    <th className="numeric">Latest price</th>
                    <th className="numeric">Value</th>
                    <th className="numeric">Weight</th>
                    <th className="numeric">Day P/L</th>
                    <th className="numeric">Position P/L</th>
                    <th>Chart</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((holding) => (
                    <tr
                      key={holding.id}
                      className={chartHolding?.id === holding.id ? "isSelected" : undefined}
                      tabIndex={0}
                      onClick={() => setChartHolding(holding)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setChartHolding(holding);
                        }
                      }}
                    >
                      <td>
                        <strong>{holding.symbol}</strong>
                        <span>{holding.name}</span>
                        <small>{holding.exchange} · {holding.currency} · {holding.valuationBasis === "market" ? "Market" : "Cost basis"}</small>
                      </td>
                      <td>{holding.ownerType === "SMSF" ? "SMSF" : "Personal"}</td>
                      <td>{sectorForInstrument(holding)}</td>
                      <td className="numeric">{number(holding.quantity)}</td>
                      <td className="numeric">
                        {price(holding.lastPrice, holding.currency)}
                        <span>{holding.asOfDate}</span>
                      </td>
                      <td className="numeric">{money(holding.marketValueAud)}</td>
                      <td className="numeric">{holding.weight.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%</td>
                      <td className={`numeric ${pnlTone(holding.dayGainAud)}`}>
                        {signedMoney(holding.dayGainAud)}
                        <span>{dailyPercent(holding) == null ? "n/a" : percent(dailyPercent(holding)!)}</span>
                      </td>
                      <td className={`numeric ${pnlTone(holding.pnlAud)}`}>
                        {signedMoney(holding.pnlAud)}
                        <span>{percent(holding.pnlPercent)}</span>
                      </td>
                      <td>
                        <div className="chartActions">
                          <button type="button" onClick={(event) => { event.stopPropagation(); setChartHolding(holding); }}>View</button>
                          <a href={tradingViewUrl(holding)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>TV</a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length ? <p className="empty">No holdings match the current search.</p> : null}
            </div>
          </Card>
        </>
      ) : null}
    </main>
  );
}

function TradingViewPanel({ holding }: { holding: DashboardHolding }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tvSymbol = tradingViewSymbol(holding);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: "D",
      timezone: "Australia/Sydney",
      theme: "dark",
      style: "1",
      locale: "en",
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [tvSymbol]);

  return (
    <section className="stockChartPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">TradingView chart</p>
          <h2 className="cardTitle">{holding.symbol} · {holding.name}</h2>
          <p className="cardIntro">{tvSymbol} · {holding.exchange} · {holding.currency}</p>
        </div>
        <a className="button" href={tradingViewUrl(holding)} target="_blank" rel="noreferrer">Open in TradingView</a>
      </div>
      <div ref={containerRef} className="tradingview-widget-container stockChartWidget" />
    </section>
  );
}
