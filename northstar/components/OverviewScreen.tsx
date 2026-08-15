"use client";

import React, { useEffect, useMemo, useState } from "react";
import TradingViewWidget from "@/components/TradingViewWidget";
import { ChartOverlay, HistoryChart } from "./HistoryChart";
import { MarketsPanel } from "./MarketsPanel";
import { ScopeTabs } from "./ScopeTabs";
import { StateOfPlayCards } from "./StateOfPlayCards";
import type { PerformancePoint } from "../lib/nav-series";
import { dataHealth, type HealthTone } from "../lib/data-health";
import { byScope, bySector, fmtAud, totals } from "../lib/portfolio-metrics";
import { compareNumber, compareText, nextSort, sortIndicator, type SortState } from "../lib/sort";
import { tradingViewChartUrl, tradingViewSymbolForInstrument } from "../lib/tradingview";
import { SECTOR_COLORS, type Holding, type PortfolioScope, type Sector } from "../types";

type SyncRunSummary = {
  source: string;
  trigger: string;
  status: "success" | "partial" | "failed" | "skipped";
  finishedAt: string;
  message: string | null;
  error: string | null;
};
type FreshnessStatus = "fresh" | "stale" | "missing" | "fallback";
type ValuationFreshnessSummary = {
  source: string;
  status: FreshnessStatus;
  asOf: string | null;
  ageDays: number | null;
  staleAfterDays: number | null;
  detail: string;
};
type BrokerShareTotal = {
  broker: string;
  value: number;
  positionCount: number;
};

type AccountBreakdownSummary = {
  scope: "personal" | "smsf";
  label: string;
  netAssetValue: number;
  investedValue: number;
  cashValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  positionCount: number;
  sharePositionValue: number;
  brokerShareTotals: BrokerShareTotal[];
  shareOfOverall: number;
  lastUpdated: string | null;
};

function pct(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

function fmtPct(value: number) {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function fmtSignedAud(value: number) {
  return `${value >= 0 ? "+" : ""}${fmtAud(value)}`;
}

function fmtSignedPct(value: number | null) {
  if (value == null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}


function fmtLatestPrice(holding: Holding) {
  if (holding.lastPrice == null) return "No price";
  const currency = holding.priceCurrency ?? "AUD";
  const value = holding.lastPrice.toLocaleString("en-AU", {
    minimumFractionDigits: holding.lastPrice >= 100 ? 2 : 3,
    maximumFractionDigits: holding.lastPrice >= 100 ? 2 : 4,
  });
  return `${currency} ${value}`;
}

function foreignCurrencyAuditHoldings(holdings: Holding[]) {
  return holdings
    .filter((holding) => (holding.priceCurrency ?? "AUD") !== "AUD" && isShareLike(holding))
    .sort((a, b) => Math.abs(b.marketValueAud) - Math.abs(a.marketValueAud));
}

function dayGainPercent(holding: Holding) {
  const gain = holding.dayGainAud ?? 0;
  const previousValue = holding.marketValueAud - gain;
  return previousValue ? (gain / previousValue) * 100 : null;
}

function fmtShortAud(value: number) {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return fmtAud(value);
}

type HoldingSortKey = "holding" | "sector" | "price" | "value" | "weight" | "day" | "pnl";
type HoldingSortState = SortState<HoldingSortKey>;


function fmtDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
  }).format(date);
}

function fmtLongDate(value: string | null | undefined) {
  if (!value) return "date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function fmtChartLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

const overviewAscendingSorts: HoldingSortKey[] = ["holding", "sector"];

function sortHoldings(holdings: Holding[], sort: HoldingSortState, total: number) {
  const valueFor = (holding: Holding) => {
    switch (sort.key) {
      case "price": return holding.lastPrice ?? Number.NEGATIVE_INFINITY;
      case "value": return holding.marketValueAud;
      case "weight": return pct(holding.marketValueAud, total);
      case "day": return holding.dayGainAud ?? 0;
      case "pnl": return holding.pnlAud;
      default: return 0;
    }
  };
  return [...holdings].sort((left, right) => {
    if (sort.key === "holding") {
      const result = compareText(left.symbol, right.symbol) || compareText(left.name, right.name);
      return sort.direction === "desc" ? -result : result;
    }
    if (sort.key === "sector") {
      const sectorResult = compareText(sectorShortName(left.sector), sectorShortName(right.sector));
      if (sectorResult) return sort.direction === "desc" ? -sectorResult : sectorResult;
      return compareNumber(left.marketValueAud, right.marketValueAud, "desc");
    }
    return compareNumber(valueFor(left), valueFor(right), sort.direction) || compareText(left.symbol, right.symbol);
  });
}
function sectorShortName(sector: Sector) {
  return sector.replace(" miners", "").replace(" bullion", "");
}

// The share tables list what is held in a brokerage account, so the test is how a holding
// is held rather than what it tracks. Physical metal is a manual asset and cash is not a
// position; metal-backed ETCs such as XRH0 and ETPMAG are listed securities with a ticker,
// a live price and a P/L, and belong here alongside SILJ and GDX.
const PHYSICAL_BROKER = "Physical";

function isShareLike(holding: Holding) {
  return holding.sector !== "Cash" && holding.broker !== PHYSICAL_BROKER;
}

type HoldingAccountGroup = {
  key: string;
  label: string;
  detail: string;
  value: number;
  holdings: Holding[];
};

function brokerDisplayName(broker?: string) {
  const normalized = (broker ?? "Unknown").trim();
  if (normalized.toLowerCase() === "ibkr") return "IBKR";
  if (normalized.toLowerCase() === "directshares") return "Directshares";
  return normalized || "Unknown";
}

function accountGroupKey(holding: Holding) {
  return [
    holding.ownerType,
    brokerDisplayName(holding.broker),
    holding.accountKey ?? holding.accountLabel ?? "unknown",
  ].join(":");
}

function ownerDisplayName(ownerType: Holding["ownerType"]) {
  return ownerType === "SMSF" ? "SMSF" : "Personal";
}

function accountGroupLabel(holding: Holding) {
  const owner = ownerDisplayName(holding.ownerType);
  const broker = brokerDisplayName(holding.broker);
  return broker === "Unknown" ? owner : `${owner} ${broker}`;
}

function accountGroupDetail(group: HoldingAccountGroup) {
  const keys = [...new Set(group.holdings.map((holding) => holding.accountKey).filter(Boolean))];
  const account = keys.length === 1 ? ` · Account ${keys[0]}` : "";
  return `${group.holdings.length} position${group.holdings.length === 1 ? "" : "s"}${account}`;
}

function holdingAccountGroups(holdings: Holding[]): HoldingAccountGroup[] {
  const groups = new Map<string, HoldingAccountGroup>();
  for (const holding of holdings) {
    const key = accountGroupKey(holding);
    const existing = groups.get(key);
    if (existing) {
      existing.holdings.push(holding);
      existing.value += holding.marketValueAud;
      continue;
    }
    groups.set(key, {
      key,
      label: accountGroupLabel(holding),
      detail: "",
      value: holding.marketValueAud,
      holdings: [holding],
    });
  }
  return [...groups.values()]
    .map((group) => ({ ...group, detail: accountGroupDetail(group) }))
    .sort((a, b) => b.value - a.value);
}

function makeDonut(sectors: Array<{ sector: Sector; value: number }>, total: number) {
  if (!total) return "conic-gradient(rgba(122,149,178,0.18) 0 100%)";
  let start = 0;
  const stops = sectors.map((sector) => {
    const end = start + pct(sector.value, total);
    const stop = `${SECTOR_COLORS[sector.sector]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function OverviewStockChartPanel({ holding }: { holding: Holding }) {
  const [expanded, setExpanded] = useState(false);
  const tvSymbol = tradingViewSymbolForInstrument(holding);
  return (
    <section className="stockChartPanel nsStockChartPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Stock chart</p>
          <h3 className="cardTitle">{holding.symbol} · {holding.name}</h3>
          <p className="cardIntro">{tvSymbol} · {holding.exchange ?? "Market"} · {holding.priceCurrency ?? "Local"}</p>
        </div>
        <div className="nsStockChartActions">
          <button className="button" type="button" onClick={() => setExpanded(true)}>Expand</button>
          <a className="button" href={tradingViewChartUrl(tvSymbol)} target="_blank" rel="noreferrer">Open in TradingView</a>
        </div>
      </div>
      <TradingViewWidget symbol={tvSymbol} minHeight={320} maxHeight={420} compactMinHeight={300} compactMaxHeight={380} heightRatio={0.48} compactHeightRatio={0.5} />
      {expanded ? (
        <ChartOverlay title={`${holding.symbol} · ${holding.name}`} onClose={() => setExpanded(false)}>
          <p className="cardIntro">{tvSymbol} · expanded embedded chart</p>
          <TradingViewWidget
            symbol={tvSymbol}
            minHeight={620}
            maxHeight={780}
            compactMinHeight={460}
            compactMaxHeight={620}
            heightRatio={0.78}
            compactHeightRatio={0.68}
          />
        </ChartOverlay>
      ) : null}
    </section>
  );
}

function HoldingsTable({ holdings, total, scope, healthTone }: { holdings: Holding[]; total: number; scope: PortfolioScope; healthTone: HealthTone }) {
  const [showAllOverall, setShowAllOverall] = useState(false);
  const [chartHolding, setChartHolding] = useState<Holding | null>(null);
  const [showFxAudit, setShowFxAudit] = useState(false);
  const [sort, setSort] = useState<HoldingSortState>({ key: "value", direction: "desc" });
  const isOverall = scope === "overall";
  const sortedHoldings = useMemo(() => sortHoldings(holdings, sort, total), [holdings, sort, total]);
  const visibleHoldings = isOverall && !showAllOverall ? sortedHoldings.slice(0, 6) : sortedHoldings;
  const accountGroups = useMemo(() => holdingAccountGroups(visibleHoldings), [visibleHoldings]);
  const showAccountGroups = !isOverall && accountGroups.length > 1;
  const fxAuditHoldings = useMemo(() => foreignCurrencyAuditHoldings(holdings), [holdings]);
  const scopeLabel = scope === "smsf" ? "SMSF" : scope === "personal" ? "Personal" : "Overall";
  const sortButton = (key: HoldingSortKey, label: string) => (
    <button className={sort.key === key ? "isActive" : ""} type="button" onClick={() => setSort((current) => nextSort(current, key, overviewAscendingSorts))} aria-sort={sort.key === key ? (sort.direction === "desc" ? "descending" : "ascending") : "none"}>
      <span>{label}</span>
      <em>{sortIndicator(sort, key)}</em>
    </button>
  );

  useEffect(() => {
    if (chartHolding && !holdings.some((holding) => holding.id === chartHolding.id)) setChartHolding(null);
  }, [chartHolding, holdings]);

  const renderRows = (rows: Holding[]) => rows.map((holding) => {
    const dailyGain = holding.dayGainAud ?? 0;
    const dailyPercent = dayGainPercent(holding);
    return (
      <div
        className={`nsHoldingRow${chartHolding?.id === holding.id ? " isSelected" : ""}`}
        role="row"
        tabIndex={0}
        aria-selected={chartHolding?.id === holding.id}
        key={holding.id}
        onClick={() => setChartHolding(holding)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setChartHolding(holding);
          }
        }}
      >
        <div className="nsHoldingIdentity">
          <strong>{holding.symbol}</strong>
          <span>{holding.name}</span>
        </div>
        <div className="nsSectorWeightCell">
          <em style={{ background: `${SECTOR_COLORS[holding.sector]}30`, color: SECTOR_COLORS[holding.sector] }}>{sectorShortName(holding.sector)}</em>
          <strong>{fmtPct(pct(holding.marketValueAud, total))}</strong>
        </div>
        <div>
          <strong>{fmtLatestPrice(holding)}</strong>
          <span>{holding.priceAsOfDate ?? holding.exchange ?? "Latest stored close"}</span>
        </div>
        <div>
          <strong>{fmtAud(holding.marketValueAud)}</strong>
          <span>{fmtPct(pct(holding.marketValueAud, total))} of NAV</span>
        </div>
        <div className={dailyGain >= 0 ? "isPositive" : "isNegative"}>
          <strong>{fmtSignedAud(dailyGain)}</strong>
          <span>{dailyPercent == null ? "n/a" : fmtSignedPct(dailyPercent)}</span>
        </div>
        <div className={holding.pnlAud >= 0 ? "isPositive" : "isNegative"}>
          <strong>{fmtSignedAud(holding.pnlAud)}</strong>
          <span>{fmtSignedPct(holding.pnlPercent)} position P/L</span>
        </div>
      </div>
    );
  });

  return (
    <section id="holdings" className="nsPanel nsPositionsPanel">
      <div className="nsPanelTopline">
        <div>
          <p className="nsEyebrow">{isOverall ? "Largest positions" : showAccountGroups ? `${scopeLabel} shares by account` : `All ${scopeLabel} shares`}</p>
          <h2>{isOverall ? "Allocation of shares" : showAccountGroups ? `${scopeLabel} account allocation` : `${scopeLabel} share allocation`}</h2>
        </div>
        <div className="nsPositionsActions">
          {fxAuditHoldings.length ? (
            <button className="nsPositionsToggle" type="button" onClick={() => setShowFxAudit((current) => !current)}>
              {showFxAudit ? "Hide FX audit" : "FX audit"}
            </button>
          ) : null}
          {isOverall && holdings.length > 6 ? (
            <button className="nsPositionsToggle" type="button" onClick={() => setShowAllOverall((current) => !current)}>
              {showAllOverall ? "Show fewer" : `Show all ${holdings.length} ->`}
            </button>
          ) : (
            <span className="nsPositionsCount"><span className={`nsStatusPip is-${healthTone}`} />All {holdings.length} shown</span>
          )}
        </div>
      </div>
      {chartHolding ? <OverviewStockChartPanel holding={chartHolding} /> : null}
      {showFxAudit ? (
        <section className="nsFxAuditPanel" aria-label="Foreign-currency P/L audit">
          <div>
            <p className="nsEyebrow">FX audit</p>
            <h3>Foreign-currency P/L basis</h3>
            <p>Position P/L is measured in AUD: current local price and current FX set market value, while historical AUD cost comes from each trade date FX rate when the IBKR feed provides it.</p>
          </div>
          <div className="nsFxAuditRows">
            {fxAuditHoldings.slice(0, 5).map((holding) => (
              <article key={holding.id}>
                <strong>{holding.symbol}</strong>
                <span>{holding.priceCurrency ?? "Local"} price · {fmtLatestPrice(holding)}</span>
                <em className={holding.pnlAud >= 0 ? "isPositive" : "isNegative"}>{fmtSignedAud(holding.pnlAud)} · {fmtSignedPct(holding.pnlPercent)}</em>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <p className="nsTableNote">Values and P/L are in AUD. Foreign holdings keep local price, trade-date AUD cost basis and current AUD market value separate.</p>
      <div className="nsHoldingsTable" role="table" aria-label={`${scopeLabel} share positions`}>
        <div className="nsHoldingsHeader" role="row">
          <span>{sortButton("holding", "Holding")}</span>
          <span>{sortButton("sector", "Sector · NAV weight")}</span>
          <span>{sortButton("price", "Latest price (local)")}</span>
          <span>{sortButton("value", "Value (AUD)")}</span>
          <span>{sortButton("day", "Day P/L")}</span>
          <span>{sortButton("pnl", "Position P/L")}</span>
        </div>
        {showAccountGroups ? accountGroups.map((group) => (
          <section className="nsHoldingsAccountGroup" key={group.key} aria-label={group.label}>
            <div className="nsHoldingsAccountHeader">
              <div>
                <strong>{group.label}</strong>
                <span>{group.detail}</span>
              </div>
              <em>{fmtAud(group.value)} · {fmtPct(pct(group.value, total))} of NAV</em>
            </div>
            {renderRows(group.holdings)}
          </section>
        )) : renderRows(visibleHoldings)}
        {!visibleHoldings.length ? <div className="nsHoldingEmpty">No share holdings in this view.</div> : null}
      </div>
    </section>
  );
}

function SectorDonut({ sectors, total }: { sectors: Array<{ sector: Sector; value: number }>; total: number }) {
  return (
    <section className="nsPanel nsSectorPanel">
      <p className="nsEyebrow">Sector distribution</p>
      <div className="nsDonutWrap">
        <div className="nsDonut" style={{ background: makeDonut(sectors, total) }}>
          <div><span>NAV</span><strong>{fmtShortAud(total)}</strong></div>
        </div>
      </div>
      <div className="nsSectorList">
        {sectors.map((sector) => (
          <div key={sector.sector}>
            <span><i style={{ background: SECTOR_COLORS[sector.sector] }} />{sector.sector}</span>
            <strong>{fmtAud(sector.value)} <em>{fmtPct(pct(sector.value, total))}</em></strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function NorthStarIntentDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="nsIntentOverlay" role="dialog" aria-modal="true" aria-labelledby="northstar-intent-title" onClick={onClose}>
      <section className="nsPanel nsIntentDialog" onClick={(event) => event.stopPropagation()}>
        <button className="nsIntentCloseButton" type="button" onClick={onClose} aria-label="Close NorthStar information">
          x
        </button>
        <div className="nsIntentLead">
          <p className="nsEyebrow">About NorthStar</p>
          <h2 id="northstar-intent-title">Fiat is the reporting currency. Gold is the numeraire.</h2>
          <p>
            NorthStar is designed to preserve and grow purchasing power, not merely nominal portfolio value. Capital begins from a reserve benchmark and moves outward only when relative leadership, structural breakouts and fundamentals justify additional risk.
          </p>
        </div>
        <div className="nsIntentChecks" aria-label="NorthStar allocation structure">
          <span>GSR establishes precious-metals leadership.</span>
          <span>Cross-commodity ratios identify challengers.</span>
          <span>Miner/metal and company/benchmark ratios test whether equity risk is being rewarded.</span>
        </div>
        <p className="nsIntentClose">
          Price determines opportunity. Structure determines commitment. The investor supplies the thesis. The market supplies the evidence. NorthStar identifies when the two agree.
        </p>
      </section>
    </div>
  );
}

/** Full redesigned overview dashboard matching the screenshot reference. */
export function OverviewScreen({ holdings, logoSrc, performance = [], accountBreakdown = [], syncRuns = [], freshnessByScope, lastUpdatedByScope, onRefresh }: {
  holdings: Holding[];
  logoSrc?: string;
  performance?: PerformancePoint[];
  accountBreakdown?: AccountBreakdownSummary[];
  syncRuns?: SyncRunSummary[];
  freshnessByScope?: Partial<Record<PortfolioScope, ValuationFreshnessSummary[]>>;
  lastUpdatedByScope?: Partial<Record<PortfolioScope, string | null>>;
  onRefresh?: () => Promise<void> | void;
}) {
  const [scope, setScope] = useState<PortfolioScope>("overall");
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncMessageTone, setSyncMessageTone] = useState<"good" | "warning" | "bad">("good");
  const [showIntentInfo, setShowIntentInfo] = useState(false);
  const view = byScope(holdings, scope);
  const t = totals(view);
  const dailyPnl = view.reduce((sum, holding) => sum + (holding.dayGainAud ?? 0), 0);
  const sectors = bySector(view);
  const shareHoldings = useMemo(
    () => view.filter(isShareLike).sort((a, b) => b.marketValueAud - a.marketValueAud),
    [view],
  );
  const freshness = freshnessByScope?.[scope] ?? freshnessByScope?.overall ?? [];
  const selectedUpdatedAt = lastUpdatedByScope?.[scope] ?? lastUpdatedByScope?.overall ?? null;
  const health = dataHealth(syncRuns, freshness);
  const cashForScope = scope === "overall"
    ? accountBreakdown.reduce((sum, account) => sum + account.cashValue, 0)
    : accountBreakdown.find((account) => account.scope === scope)?.cashValue ?? 0;
  const investedNow = Math.max(0, t.marketValue - cashForScope);
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  };
  const syncEverything = async () => {
    setSyncingAll(true);
    setSyncMessage("Sync running...");
    setSyncMessageTone("warning");
    try {
      const response = await fetch("/api/sync/all", { method: "POST" });
      const payload = await response.json();
      const errors = Array.isArray(payload.errors) ? payload.errors.filter(Boolean) : [];
      if (!response.ok && !errors.length) throw new Error(payload.error || "Sync failed.");
      if (errors.length) {
        setSyncMessage(`Sync finished with ${errors.length} issue${errors.length === 1 ? "" : "s"}.`);
        setSyncMessageTone("warning");
      } else {
        setSyncMessage("Sync complete.");
        setSyncMessageTone("good");
      }
      await onRefresh?.();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Sync failed.");
      setSyncMessageTone("bad");
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <main className="nsScreenMain nsOverview">
        <header className="nsOverviewHeader">
          <div>
            <h1>State of play</h1>
          </div>
          <div className="nsHeaderControls">
            <ScopeTabs value={scope} onChange={setScope} />
            <p><span className={`nsStatusPip is-${health.tone}`} />{health.label} · Valuations · {fmtLongDate(selectedUpdatedAt)}</p>
            {syncMessage ? <p><span className={`nsStatusPip is-${syncMessageTone}`} />{syncMessage}</p> : null}
            <div className="nsReportLinks">
              <button className="nsReportButton" type="button" onClick={() => void syncEverything()} disabled={syncingAll}>
                {syncingAll ? "Syncing..." : "Sync everything"}
              </button>
              <a className="nsReportLink" href={`/api/reports/wealth-statement?scope=${scope}`}>Wealth CSV</a>
              <a className="nsReportLink" href="/api/reports/estate-summary">Estate CSV</a>
              <button className="nsReportButton" type="button" onClick={() => setShowIntentInfo(true)}>About</button>
              <button className="nsReportButton" type="button" onClick={() => void signOut()}>Sign out</button>
            </div>
          </div>
        </header>

        <MarketsPanel />

        <StateOfPlayCards total={t} dailyPnl={dailyPnl} accounts={accountBreakdown} holdings={holdings} scope={scope} />

        {showIntentInfo ? <NorthStarIntentDialog onClose={() => setShowIntentInfo(false)} /> : null}

        <div className="nsStateChartGrid">
          <HistoryChart now={t.marketValue} investedNow={investedNow} scope={scope} performance={performance} />
          <SectorDonut sectors={sectors} total={t.marketValue} />
        </div>

        <HoldingsTable holdings={shareHoldings} total={t.marketValue} scope={scope} healthTone={health.tone} />

    </main>
  );
}
