"use client";

import { useEffect, useMemo, useState } from "react";
import CapitalSummary from "@/components/CapitalSummary";
import PageHeader from "@/components/PageHeader";
import TradingViewWidget from "@/components/TradingViewWidget";
import { CompanyNewsList, NewsBadge } from "@/components/CompanyNews";
import { acquisitionsByHolding, heldLabel, ownerSymbolKey, type Acquisition, type OpenLotRow } from "@/components/holdings/acquisition";
import type { CompanyNewsItem } from "@/lib/integrations/company-news/types";
import type { DashboardData, DashboardHolding, Scope } from "@/lib/storage";
import { Card, Notice, SummaryGrid } from "@/northstar/components";
import { sectorForInstrument } from "@/northstar/lib/sector-map";
import { compareNumber, compareText, nextSort, sortIndicator, type SortState } from "@/northstar/lib/sort";
import { tradingViewChartUrl, tradingViewSymbolForInstrument } from "@/northstar/lib/tradingview";

type DashboardMap = Partial<Record<Scope, DashboardData>>;
type HoldingsSortKey = "holding" | "owner" | "sector" | "units" | "entry" | "acquired" | "price" | "value" | "weight" | "day" | "pnl" | "relative";
type HoldingsSortState = SortState<HoldingsSortKey>;

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

/** Day-month-year throughout Capital: the stored ISO date reads year-first and inverts on sight. */
const dayMonthYear = (value: string | null | undefined) => {
  if (!value) return "Not recorded";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
    .formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")}`;
};

const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;

/** The second line under an acquisition date: how long held, and whether it was built from several buys. */
function acquisitionNote(acquisition: Acquisition | null) {
  if (!acquisition) return "No lot history";
  if (!acquisition.firstAcquired) return "No trade history";
  const held = heldLabel(acquisition.firstAcquired);
  return acquisition.lots > 1 ? `${held} · ${acquisition.lots} lots` : held;
}

/** Percentage points, not percent: this is the gap between two returns, not a return itself. */
const relativeToBook = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })} pp`;

/**
 * The book's own return, as the baseline each position is measured against.
 *
 * Taken from the share positions rather than the headline portfolio return, which carries cash and
 * would drag the baseline down by an amount that has nothing to do with how the shares did. The
 * filtered rows are deliberately not used either: a baseline that moved as you typed in the search
 * box would make every number on screen mean something different.
 */
function bookReturn(holdings: DashboardHolding[]) {
  let cost = 0;
  let gain = 0;
  for (const holding of holdings) {
    if (isCashHolding(holding) || !holding.costAud) continue;
    cost += holding.costAud;
    gain += holding.pnlAud;
  }
  return cost ? (gain / cost) * 100 : 0;
}

function dailyPercent(holding: DashboardHolding) {
  const previousValue = holding.marketValueAud - holding.dayGainAud;
  return previousValue ? holding.dayGainAud / previousValue * 100 : null;
}

async function loadDashboard(scope: Scope): Promise<DashboardData> {
  const response = await fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load holdings");
  return payload as DashboardData;
}

/**
 * Acquisition dates come from the CGT lots, which are the only place trade history is reconstructed.
 * Holdings with no imported trades — Directshares and physical metal — come back undated.
 */
async function loadAcquisitions(): Promise<{ byId: Map<string, Acquisition>; byOwnerSymbol: Map<string, Acquisition> }> {
  const response = await fetch("/api/tax-lots?scope=overall", { cache: "no-store" });
  const payload = await response.json() as { openLots?: OpenLotRow[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load acquisition history");
  return acquisitionsByHolding(payload.openLots ?? []);
}

/** Announcements are keyed by symbol and exchange, because the exchange decides the provider. */
async function loadCompanyNews(holdings: DashboardHolding[]): Promise<Record<string, CompanyNewsItem[]>> {
  const instruments = holdings
    .filter((holding) => !isCashHolding(holding))
    .map((holding) => `${holding.symbol}:${holding.exchange}:${holding.name.replace(/,/g, " ")}`);
  if (!instruments.length) return {};
  const response = await fetch(`/api/news?instruments=${encodeURIComponent(instruments.join(","))}`, { cache: "no-store" });
  const payload = await response.json() as { bySymbol?: Record<string, CompanyNewsItem[]>; errors?: string[] };
  if (!response.ok) throw new Error(payload.errors?.[0] || "Unable to load company news");
  return payload.bySymbol ?? {};
}

function includesQuery(holding: DashboardHolding, query: string) {
  const text = `${holding.symbol} ${holding.name} ${holding.ownerType} ${holding.exchange} ${holding.currency} ${holding.assetClass}`.toLowerCase();
  return text.includes(query.toLowerCase());
}

function pnlTone(value: number) {
  return value >= 0 ? "positive" : "negative";
}

function isCashHolding(holding: DashboardHolding) {
  return holding.symbol === "CASH" || holding.exchange === "CASH" || sectorForInstrument(holding) === "Cash";
}

function tradingViewSymbol(holding: DashboardHolding) {
  return tradingViewSymbolForInstrument(holding);
}

function tradingViewUrl(holding: DashboardHolding) {
  return tradingViewChartUrl(tradingViewSymbol(holding));
}

const holdingsAscendingSorts: HoldingsSortKey[] = ["holding", "owner", "sector"];

function sortHoldings(rows: DashboardHolding[], sort: HoldingsSortState, acquiredOn: (holding: DashboardHolding) => string) {
  return [...rows].sort((left, right) => {
    if (sort.key === "acquired") {
      // Undated holdings sort together at the end rather than ahead of everything as empty strings.
      const dateFor = (holding: DashboardHolding) => acquiredOn(holding) || "9999-12-31";
      return compareText(dateFor(left), dateFor(right)) * (sort.direction === "asc" ? 1 : -1)
        || compareText(left.symbol, right.symbol);
    }

    if (sort.key === "holding") {
      const result = compareText(left.symbol, right.symbol) || compareText(left.name, right.name);
      return sort.direction === "desc" ? -result : result;
    }
    if (sort.key === "owner") {
      const result = compareText(left.ownerType, right.ownerType) || compareText(left.symbol, right.symbol);
      return sort.direction === "desc" ? -result : result;
    }
    if (sort.key === "sector") {
      const sectorResult = compareText(sectorForInstrument(left), sectorForInstrument(right));
      if (sectorResult) return sort.direction === "desc" ? -sectorResult : sectorResult;
      return compareNumber(left.marketValueAud, right.marketValueAud, "desc");
    }
    const valueFor = (holding: DashboardHolding) => {
      switch (sort.key) {
        case "units": return holding.quantity;
        case "entry": return holding.averageCostAud || Number.NEGATIVE_INFINITY;
        case "relative": return holding.pnlPercent;
        case "price": return holding.lastPrice ?? Number.NEGATIVE_INFINITY;
        case "value": return holding.marketValueAud;
        case "weight": return holding.weight;
        case "day": return holding.dayGainAud;
        case "pnl": return holding.pnlAud;
        default: return 0;
      }
    };
    return compareNumber(valueFor(left), valueFor(right), sort.direction) || compareText(left.symbol, right.symbol);
  });
}
export default function HoldingsPage() {
  const [dashboards, setDashboards] = useState<DashboardMap>({});
  const [scope, setScope] = useState<Scope>("overall");
  const [query, setQuery] = useState("");
  const [chartHolding, setChartHolding] = useState<DashboardHolding | null>(null);
  const [acquisitions, setAcquisitions] = useState<{ byId: Map<string, Acquisition>; byOwnerSymbol: Map<string, Acquisition> }>({ byId: new Map(), byOwnerSymbol: new Map() });
  const [news, setNews] = useState<Record<string, CompanyNewsItem[]>>({});
  const [newsLoading, setNewsLoading] = useState(true);
  const [sort, setSort] = useState<HoldingsSortState>({ key: "value", direction: "desc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [overall, personal, smsf] = await Promise.all(scopes.map((item) => loadDashboard(item.key)));
        if (!cancelled) {
          setDashboards({ overall, personal, smsf });
          setLoading(false);
        }
        try {
          const lots = await loadAcquisitions();
          if (!cancelled) setAcquisitions(lots);
        } catch {
          // Dates are a nicety here; the tax page is where a lot failure actually matters.
        }
        try {
          const items = await loadCompanyNews(overall.holdings);
          if (!cancelled) setNews(items);
        } catch {
          // The position book is the point of this screen; a missing feed must not disturb it.
        } finally {
          if (!cancelled) setNewsLoading(false);
        }
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

  /** Lot ids carry the holding id, but fall back to owner and symbol if a position was rebuilt. */
  const acquisitionFor = (holding: DashboardHolding) =>
    acquisitions.byId.get(holding.id)
    ?? acquisitions.byOwnerSymbol.get(ownerSymbolKey(holding.ownerType, holding.symbol))
    ?? null;

  const rows = useMemo(() => {
    const visible = (selected?.holdings ?? [])
      .filter((holding) => !query.trim() || includesQuery(holding, query.trim()));
    return sortHoldings(visible, sort, (holding) => acquisitionFor(holding)?.firstAcquired ?? "");
  }, [selected, query, sort, acquisitions]);

  const sortButton = (key: HoldingsSortKey, label: string) => (
    <button className={sort.key === key ? "isActive" : ""} type="button" onClick={() => setSort((current) => nextSort(current, key, holdingsAscendingSorts))} aria-sort={sort.key === key ? (sort.direction === "desc" ? "descending" : "ascending") : "none"}>
      <span>{label}</span>
      <em>{sortIndicator(sort, key)}</em>
    </button>
  );

  const fallbackCount = rows.filter((holding) => holding.valuationBasis === "cost_basis").length;
  const bookReturnPercent = bookReturn(selected?.holdings ?? []);

  const scopeLabel = scopes.find((item) => item.key === scope)?.label ?? "Overall";

  useEffect(() => {
    if (chartHolding && !rows.some((holding) => holding.id === chartHolding.id)) setChartHolding(null);
  }, [rows, chartHolding]);

  return (
    <main className="shell">
      <PageHeader
        title="Capital"
        description="Legal books, broker share allocation and the full live position book by owner, valuation basis and return."
        links={[
          { href: "/", label: "State of play" },
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
          <CapitalSummary accounts={accountRows} />

          <Card className="holdingsBook">
            <div className="panelHeader holdingsHeader">
              <div>
                <p className="eyebrow">Position book</p>
                <h2 className="cardTitle">{scopeLabel} share positions</h2>
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
                ["Day P/L", signedMoney(selected.dailyMovement), pnlTone(selected.dailyMovement)],
                ["Invested", money(selected.investedValue)],
                ["Cash", money(selected.cashValue)],
                ["Cost fallback", fallbackCount],
              ]}
            />

            {chartHolding ? <TradingViewPanel holding={chartHolding} news={news[chartHolding.symbol.toUpperCase()] ?? []} newsLoading={newsLoading} /> : null}

            <div className="holdingsTableWrap">
              <table className="holdingsTable">
                <thead>
                  <tr>
                    <th>{sortButton("holding", "Holding")}</th>
                    <th>{sortButton("owner", "Owner")}</th>
                    <th>{sortButton("sector", "Sector")}</th>
                    <th className="numeric">{sortButton("units", "Units")}</th>
                    <th className="numeric">{sortButton("entry", "Avg entry (AUD)")}</th>
                    <th>{sortButton("acquired", "Acquired")}</th>
                    <th className="numeric">{sortButton("price", "Latest price (local)")}</th>
                    <th className="numeric">{sortButton("value", "Value (AUD)")}</th>
                    <th className="numeric">{sortButton("weight", "Weight")}</th>
                    <th className="numeric">{sortButton("day", "Day P/L")}</th>
                    <th className="numeric">{sortButton("pnl", "Position P/L")}</th>
                    <th className="numeric">{sortButton("relative", "vs book")}</th>
                    <th>Chart</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((holding) => (
                    <tr
                      key={holding.id}
                      className={chartHolding?.id === holding.id ? "isSelected" : undefined}
                      tabIndex={isCashHolding(holding) ? undefined : 0}
                      onClick={() => {
                        if (!isCashHolding(holding)) setChartHolding(holding);
                      }}
                      onKeyDown={(event) => {
                        if (!isCashHolding(holding) && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          setChartHolding(holding);
                        }
                      }}
                    >
                      <td>
                        <strong>{holding.symbol}<NewsBadge items={news[holding.symbol.toUpperCase()] ?? []} /></strong>
                        <span>{holding.name}</span>
                        <small>{holding.exchange} · {holding.currency} · {holding.valuationBasis === "market" ? "Market" : "Cost basis"}</small>
                      </td>
                      <td>{holding.ownerType === "SMSF" ? "SMSF" : "Personal"}</td>
                      <td>{sectorForInstrument(holding)}</td>
                      <td className="numeric">{number(holding.quantity)}</td>
                      <td className="numeric">
                        {holding.averageCostAud ? price(holding.averageCostAud, "AUD") : "n/a"}
                        <span>{holding.averageCostAud ? money(holding.costAud) : "No cost basis"}</span>
                      </td>
                      <td>
                        {acquisitionFor(holding)?.firstAcquired
                          ? dayMonthYear(acquisitionFor(holding)!.firstAcquired)
                          : "Unknown"}
                        <span>{acquisitionNote(acquisitionFor(holding))}</span>
                      </td>
                      <td className="numeric">
                        {price(holding.lastPrice, holding.currency)}
                        <span>{dayMonthYear(holding.asOfDate)}</span>
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
                      <td className={`numeric ${pnlTone(holding.pnlPercent - bookReturnPercent)}`}>
                        {relativeToBook(holding.pnlPercent - bookReturnPercent)}
                        <span>book {percent(bookReturnPercent)}</span>
                      </td>
                      <td>
                        {isCashHolding(holding) ? (
                          <span className="muted">Cash</span>
                        ) : (
                          <div className="chartActions">
                            <button type="button" onClick={(event) => { event.stopPropagation(); setChartHolding(holding); }}>View</button>
                            <a href={tradingViewUrl(holding)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>TV</a>
                          </div>
                        )}
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

function TradingViewPanel({ holding, news, newsLoading }: { holding: DashboardHolding; news: CompanyNewsItem[]; newsLoading: boolean }) {
  const tvSymbol = tradingViewSymbol(holding);

  return (
    <section className="stockChartPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Stock chart</p>
          <h2 className="cardTitle">{holding.symbol} · {holding.name}</h2>
          <p className="cardIntro">{tvSymbol} · {holding.exchange} · {holding.currency}</p>
        </div>
        <a className="button" href={tradingViewUrl(holding)} target="_blank" rel="noreferrer">Open in TradingView</a>
      </div>
      <TradingViewWidget symbol={tvSymbol} />
      <div className="newsPanel">
        <p className="eyebrow">Announcements &amp; filings</p>
        <CompanyNewsList items={news} loading={newsLoading} />
      </div>
    </section>
  );
}
