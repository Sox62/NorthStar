"use client";

import { useEffect, useMemo, useState } from "react";
import CapitalSummary from "@/components/CapitalSummary";
import PageHeader from "@/components/PageHeader";
import TradingViewWidget from "@/components/TradingViewWidget";
import type { DashboardData, DashboardHolding, Scope, StoredDailyPrice } from "@/lib/storage";
import { Card, Notice, SummaryGrid } from "@/northstar/components";
import { sectorForInstrument } from "@/northstar/lib/sector-map";
import { compareNumber, compareText, nextSort, sortIndicator, type SortState } from "@/northstar/lib/sort";
import { tradingViewChartUrl, tradingViewSymbolForInstrument } from "@/northstar/lib/tradingview";

type DashboardMap = Partial<Record<Scope, DashboardData>>;
type PriceBookResponse = {
  prices?: StoredDailyPrice[];
  error?: string;
};

type HoldingsSortKey = "holding" | "owner" | "sector" | "units" | "price" | "value" | "weight" | "day" | "pnl";
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

async function loadStoredPrices(): Promise<StoredDailyPrice[]> {
  const response = await fetch("/api/prices/daily?limit=12000", { cache: "no-store" });
  const payload = await response.json() as PriceBookResponse;
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load stored prices");
  return payload.prices ?? [];
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

function sortHoldings(rows: DashboardHolding[], sort: HoldingsSortState) {
  return [...rows].sort((left, right) => {
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
function canonicalMarket(value: string) {
  const exchange = value.trim().toUpperCase();
  if (["CA", "CANADA", "TSX", "TSXV", "TSE", "CVE", "TSX/TSXV"].includes(exchange)) return "CA";
  if (["AU", "ASX", "CHIXAU"].includes(exchange)) return "ASX";
  if (["US", "USA", "NYSE", "NASDAQ", "AMEX", "ARCA", "NYSEARCA"].includes(exchange)) return "US";
  return exchange;
}

function storedPriceMatchesHolding(row: StoredDailyPrice, holding: DashboardHolding) {
  return row.symbol.toUpperCase() === holding.symbol.toUpperCase()
    && canonicalMarket(row.exchange) === canonicalMarket(holding.exchange);
}

function priceHistoryForHolding(prices: StoredDailyPrice[], holding: DashboardHolding) {
  const byDate = new Map<string, StoredDailyPrice>();
  for (const row of prices) {
    if (!storedPriceMatchesHolding(row, holding)) continue;
    const current = byDate.get(row.priceDate);
    if (!current || current.retrievedAt < row.retrievedAt) byDate.set(row.priceDate, row);
  }
  return [...byDate.values()]
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate))
    .slice(-180);
}

export default function HoldingsPage() {
  const [dashboards, setDashboards] = useState<DashboardMap>({});
  const [storedPrices, setStoredPrices] = useState<StoredDailyPrice[]>([]);
  const [priceError, setPriceError] = useState("");
  const [scope, setScope] = useState<Scope>("overall");
  const [query, setQuery] = useState("");
  const [chartHolding, setChartHolding] = useState<DashboardHolding | null>(null);
  const [sort, setSort] = useState<HoldingsSortState>({ key: "value", direction: "desc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      setPriceError("");
      try {
        const [overall, personal, smsf] = await Promise.all(scopes.map((item) => loadDashboard(item.key)));
        if (!cancelled) {
          setDashboards({ overall, personal, smsf });
          setLoading(false);
        }
        try {
          const prices = await loadStoredPrices();
          if (!cancelled) {
            setStoredPrices(prices);
            setPriceError("");
          }
        } catch (reason) {
          if (!cancelled) setPriceError(reason instanceof Error ? reason.message : "Unable to load stored prices");
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

  const rows = useMemo(() => {
    const visible = (selected?.holdings ?? [])
      .filter((holding) => !query.trim() || includesQuery(holding, query.trim()));
    return sortHoldings(visible, sort);
  }, [selected, query, sort]);

  const sortButton = (key: HoldingsSortKey, label: string) => (
    <button className={sort.key === key ? "isActive" : ""} type="button" onClick={() => setSort((current) => nextSort(current, key, holdingsAscendingSorts))} aria-sort={sort.key === key ? (sort.direction === "desc" ? "descending" : "ascending") : "none"}>
      <span>{label}</span>
      <em>{sortIndicator(sort, key)}</em>
    </button>
  );

  const fallbackCount = rows.filter((holding) => holding.valuationBasis === "cost_basis").length;
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

            {chartHolding ? <TradingViewPanel holding={chartHolding} storedPrices={storedPrices} priceError={priceError} /> : null}

            <div className="holdingsTableWrap">
              <table className="holdingsTable">
                <thead>
                  <tr>
                    <th>{sortButton("holding", "Holding")}</th>
                    <th>{sortButton("owner", "Owner")}</th>
                    <th>{sortButton("sector", "Sector")}</th>
                    <th className="numeric">{sortButton("units", "Units")}</th>
                    <th className="numeric">{sortButton("price", "Latest price (local)")}</th>
                    <th className="numeric">{sortButton("value", "Value (AUD)")}</th>
                    <th className="numeric">{sortButton("weight", "Weight")}</th>
                    <th className="numeric">{sortButton("day", "Day P/L")}</th>
                    <th className="numeric">{sortButton("pnl", "Position P/L")}</th>
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

function NativePriceChart({ holding, storedPrices, priceError }: { holding: DashboardHolding; storedPrices: StoredDailyPrice[]; priceError: string }) {
  const series = useMemo(() => priceHistoryForHolding(storedPrices, holding), [storedPrices, holding]);
  const first = series[0];
  const last = series.at(-1);
  const min = series.reduce((value, row) => Math.min(value, row.close), Number.POSITIVE_INFINITY);
  const max = series.reduce((value, row) => Math.max(value, row.close), Number.NEGATIVE_INFINITY);
  const width = 760;
  const height = 220;
  const padX = 22;
  const padTop = 22;
  const padBottom = 34;
  const chartHeight = height - padTop - padBottom;
  const chartWidth = width - padX * 2;
  const range = Math.max(0.000001, max - min);
  const path = series.map((row, index) => {
    const x = padX + (series.length === 1 ? chartWidth : index / (series.length - 1) * chartWidth);
    const y = padTop + (max - row.close) / range * chartHeight;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  const fillPath = path ? `${path} L ${padX + chartWidth} ${height - padBottom} L ${padX} ${height - padBottom} Z` : "";
  const latestChange = first && last ? last.close - first.close : 0;
  const latestChangePercent = first?.close ? latestChange / first.close * 100 : 0;
  const currency = last?.currency ?? holding.currency;
  const yTicks = [max, min + range / 2, min].filter((value) => Number.isFinite(value));

  return (
    <div className="nativeStockChart">
      <div className="nativeChartHeader">
        <div>
          <p className="eyebrow">NorthStar price history</p>
          <h3>{last ? price(last.close, currency) : "No stored close"}</h3>
          <span>{series.length ? `${series.length} stored close${series.length === 1 ? "" : "s"} · ${dateLabel(first.priceDate)} to ${dateLabel(last!.priceDate)}` : priceError || "No stored price history for this holding yet."}</span>
        </div>
        {series.length ? (
          <div className={`nativeChartChange ${pnlTone(latestChange)}`}>
            <strong>{latestChange >= 0 ? "+" : ""}{price(latestChange, currency)}</strong>
            <span>{percent(latestChangePercent)}</span>
          </div>
        ) : null}
      </div>

      {series.length >= 2 ? (
        <svg className="nativeChartSvg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${holding.symbol} stored price history`}>
          {yTicks.map((tick) => {
            const y = padTop + (max - tick) / range * chartHeight;
            return (
              <g key={tick.toFixed(6)}>
                <line className="nativeChartGrid" x1={padX} x2={padX + chartWidth} y1={y} y2={y} />
                <text className="nativeChartLabel" x={padX + chartWidth - 4} y={Math.max(12, y - 5)} textAnchor="end">{price(tick, currency)}</text>
              </g>
            );
          })}
          <path className="nativeChartFill" d={fillPath} />
          <path className="nativeChartLine" d={path} />
          <circle className="nativeChartDot" cx={padX + chartWidth} cy={padTop + (max - last!.close) / range * chartHeight} r="4.5" />
          <text className="nativeChartDate" x={padX} y={height - 9}>{dateLabel(first.priceDate)}</text>
          <text className="nativeChartDate" x={padX + chartWidth} y={height - 9} textAnchor="end">{dateLabel(last!.priceDate)}</text>
        </svg>
      ) : (
        <div className="nativeChartEmpty">
          <strong>{priceError ? "Price history unavailable" : "No stored chart yet"}</strong>
          <span>{priceError || "Run a price refresh or add historical closes on the Pricing page to populate this chart."}</span>
        </div>
      )}
    </div>
  );
}

function TradingViewPanel({ holding, storedPrices, priceError }: { holding: DashboardHolding; storedPrices: StoredDailyPrice[]; priceError: string }) {
  const tvSymbol = tradingViewSymbol(holding);

  return (
    <section className="stockChartPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Stock chart</p>
          <h2 className="cardTitle">{holding.symbol} · {holding.name}</h2>
          <p className="cardIntro">NorthStar stored closes · {tvSymbol} · {holding.exchange} · {holding.currency}</p>
        </div>
        <a className="button" href={tradingViewUrl(holding)} target="_blank" rel="noreferrer">Open in TradingView</a>
      </div>
      <NativePriceChart holding={holding} storedPrices={storedPrices} priceError={priceError} />
      <TradingViewWidget symbol={tvSymbol} />
    </section>
  );
}
