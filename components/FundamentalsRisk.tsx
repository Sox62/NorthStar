"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import type { DashboardData, MinerFundamentals } from "@/lib/storage";
import { Card, Notice, SectorTag, StatusBadge, SummaryGrid } from "@/northstar/components";
import type { Holding, Sector } from "@/northstar/types";
import { SECTOR_COLORS } from "@/northstar/types";
import { dashboardToNorthstarHoldings } from "./northstar-adapter";

type FundamentalsState = {
  holdings: Holding[];
  fundamentals: MinerFundamentals[];
  loading: boolean;
  error: string;
};

type FundamentalsResponse = {
  fundamentals?: MinerFundamentals[];
  error?: string;
};

type MetricDefinition = {
  label: string;
  field: string;
  reason: string;
};

const minerSectors: Sector[] = ["Silver miners", "Gold miners", "Uranium miners", "Uranium explorers"];

const metricDefinitions: MetricDefinition[] = [
  { label: "Production margin", field: "Spot price - AISC", reason: "Shows operating leverage before trusting a miner P/L number." },
  { label: "Balance sheet cover", field: "FCF / net debt", reason: "Flags whether debt can be handled at current metal prices." },
  { label: "Resource value", field: "Market cap / resource oz", reason: "Compares ounces in the ground without mixing it into portfolio NAV." },
  { label: "Ounces per share", field: "Resource oz / fully diluted shares", reason: "Keeps dilution visible when a story looks attractive." },
  { label: "Project economics", field: "NPV, capex, IRR", reason: "Separates good geology from financeable mine plans." },
  { label: "Risk score", field: "Jurisdiction, management, dilution, funding", reason: "Turns the checklist into a repeatable decision surface." },
];

const checklist = [
  "AISC and all-in cost per ounce",
  "Annual production or expected production",
  "Measured, indicated and inferred resources",
  "Reserve life and mine life",
  "Cash, debt, fully diluted shares",
  "Project NPV, capex and IRR",
  "Jurisdiction and permitting notes",
  "Insider ownership, options and recent dilution",
];

const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;

async function loadDashboard(scope: "personal" | "smsf"): Promise<DashboardData> {
  const response = await fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load fundamentals");
  return payload as DashboardData;
}

async function loadFundamentals(symbols: string[]): Promise<MinerFundamentals[]> {
  if (!symbols.length) return [];
  const response = await fetch(`/api/fundamentals?symbols=${encodeURIComponent(symbols.join(","))}`, { cache: "no-store" });
  const payload = await response.json() as FundamentalsResponse;
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load fundamentals ledger");
  return payload.fundamentals ?? [];
}

function isMinerHolding(holding: Holding) {
  return minerSectors.includes(holding.sector);
}

function scoreStatus(holding: Holding) {
  if (holding.valuationBasis === "cost_basis") return { label: "Needs market price", tone: "warning" as const };
  if (!holding.priceAsOfDate) return { label: "Needs price date", tone: "warning" as const };
  return { label: "Awaiting fundamentals", tone: "warning" as const };
}

function totalValue(holdings: Holding[]) {
  return holdings.reduce((sum, holding) => sum + holding.marketValueAud, 0);
}

function topRisk(holdings: Holding[]) {
  const sorted = [...holdings].sort((a, b) => b.marketValueAud - a.marketValueAud);
  return sorted[0] ?? null;
}

function averageScore(fundamentals: MinerFundamentals | undefined) {
  if (!fundamentals) return null;
  const scores = [fundamentals.jurisdictionScore, fundamentals.balanceSheetScore, fundamentals.dilutionScore, fundamentals.managementScore]
    .filter((value): value is number => value != null);
  return scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
}

function numberOrDash(value: number | null | undefined, suffix = "") {
  return value == null ? "-" : `${value.toLocaleString("en-AU", { maximumFractionDigits: 2 })}${suffix}`;
}

function moneyOrDash(value: number | null | undefined) {
  return value == null ? "-" : money(value);
}

function dateOrDash(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "-";
}

export default function FundamentalsRisk() {
  const [{ holdings, fundamentals, loading, error }, setState] = useState<FundamentalsState>({ holdings: [], fundamentals: [], loading: true, error: "" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const [personal, smsf] = await Promise.all([loadDashboard("personal"), loadDashboard("smsf")]);
        const nextHoldings = [...dashboardToNorthstarHoldings(personal), ...dashboardToNorthstarHoldings(smsf)].filter(isMinerHolding);
        const symbols = [...new Set(nextHoldings.map((holding) => holding.symbol.toUpperCase()))];
        const nextFundamentals = await loadFundamentals(symbols);
        if (!cancelled) setState({ holdings: nextHoldings, fundamentals: nextFundamentals, loading: false, error: "" });
      } catch (reason) {
        if (!cancelled) setState({ holdings: [], fundamentals: [], loading: false, error: reason instanceof Error ? reason.message : "Unable to load fundamentals" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedHoldings = useMemo(() => [...holdings].sort((a, b) => b.marketValueAud - a.marketValueAud), [holdings]);
  const value = totalValue(sortedHoldings);
  const largest = topRisk(sortedHoldings);
  const sectors = useMemo(() => {
    const totals = new Map<Sector, number>();
    for (const holding of sortedHoldings) totals.set(holding.sector, (totals.get(holding.sector) ?? 0) + holding.marketValueAud);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [sortedHoldings]);
  const fundamentalsBySymbol = useMemo(() => new Map(fundamentals.map((item) => [item.symbol.toUpperCase(), item])), [fundamentals]);

  return (
    <main className="shell">
      <PageHeader
        title="Fundamentals & risk"
        description="A disciplined miner checklist and data capture surface. Edge scores stay blank until NorthStar has source fundamentals, so this screen does not invent conviction."
        links={[
          { href: "/", label: "State of play" },
          { href: "/holdings", label: "Capital" },
          { href: "/targets", label: "Armed list" },
        ]}
      />

      {error ? <Notice tone="error" title="Unable to load fundamentals">{error}</Notice> : null}

      <section className="fundamentalsHero">
        <Card>
          <p className="eyebrow">Miner book</p>
          <h2 className="cardTitle">{loading ? "Loading miner exposure" : money(value)}</h2>
          <p className="cardIntro">Gold, silver and uranium miners only. Cash, physical metal, oil and broad equity positions are excluded from this workbench.</p>
          <SummaryGrid
            entries={[
              ["Miner positions", loading ? "..." : String(sortedHoldings.length)],
              ["Largest position", largest ? `${largest.symbol} · ${money(largest.marketValueAud)}` : "n/a"],
              ["Largest sector", sectors[0] ? `${sectors[0][0]} · ${money(sectors[0][1])}` : "n/a"],
              ["Saved records", loading ? "..." : String(fundamentals.length)],
            ]}
          />
        </Card>

        <Card>
          <p className="eyebrow">Edge score inputs</p>
          <h2 className="cardTitle">No score until data is sourced</h2>
          <p className="cardIntro">The methodology needs company-level fundamentals, not just broker prices. This keeps the risk framework useful without pretending the feed already knows mine economics.</p>
          <div className="fundamentalsChecklist">
            {checklist.map((item) => <span key={item}>{item}</span>)}
          </div>
        </Card>
      </section>

      <section className="fundamentalsGrid" aria-label="Fundamentals metrics">
        {metricDefinitions.map((metric) => (
          <Card key={metric.label} className="fundamentalsMetric">
            <p className="eyebrow">{metric.label}</p>
            <strong>{metric.field}</strong>
            <span>{metric.reason}</span>
          </Card>
        ))}
      </section>

      <Card className="fundamentalsTableCard">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Current candidates</p>
            <h2 className="cardTitle">Miner fundamentals queue</h2>
          </div>
          <StatusBadge tone="warning">
            {loading ? "Loading" : `${sortedHoldings.length} miners`}
          </StatusBadge>
        </div>

        <div className="holdingsTableWrap">
          <table className="holdingsTable fundamentalsTable">
            <thead>
              <tr>
                <th>Holding</th>
                <th>Owner</th>
                <th>Theme</th>
                <th className="numeric">Value A$</th>
                <th className="numeric">Total P/L</th>
                <th>Fundamental status</th>
                <th>Core inputs</th>
                <th>Risk notes</th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((holding) => {
                const saved = fundamentalsBySymbol.get(holding.symbol.toUpperCase());
                const status = saved ? { label: "Research saved", tone: "good" as const } : scoreStatus(holding);
                const score = averageScore(saved);
                return (
                  <tr key={holding.id}>
                    <td>
                      <strong>{holding.symbol}</strong>
                      <span>{holding.name}</span>
                      <small>{holding.broker ?? "Unknown broker"} · {holding.priceCurrency ?? "AUD"}</small>
                    </td>
                    <td>{holding.ownerType === "SMSF" ? "SMSF" : "Personal"}</td>
                    <td><SectorTag label={holding.sector} color={SECTOR_COLORS[holding.sector]} /></td>
                    <td className="numeric">{money(holding.marketValueAud)}<small>{holding.marketValueAud && value ? `${(holding.marketValueAud / value * 100).toFixed(1)}% miner book` : "0.0% miner book"}</small></td>
                    <td className={`numeric ${holding.pnlAud >= 0 ? "positive" : "negative"}`}>{money(holding.pnlAud)}<small>{percent(holding.pnlPercent)}</small></td>
                    <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge><small>{score == null ? "No risk score" : `${score.toFixed(1)} / 5 avg score`}</small></td>
                    <td>
                      <span>AISC {numberOrDash(saved?.aiscUsdPerOz, " USD/oz")} · Resource {numberOrDash(saved?.resourceMoz, " Moz")}</span>
                      <small>Cash {moneyOrDash(saved?.cashAud)} · Debt {moneyOrDash(saved?.debtAud)} · NPV {moneyOrDash(saved?.npvAud)}</small>
                    </td>
                    <td>
                      <span>{saved?.jurisdiction ?? "Jurisdiction needed"}{saved?.primaryMetal ? ` · ${saved.primaryMetal}` : ""}</span>
                      <small>{saved?.asOfDate ? `As of ${dateOrDash(saved.asOfDate)}` : "Production, AISC, resource oz and source date needed."}</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && !sortedHoldings.length ? <p className="empty">No miner holdings are available for this workbench.</p> : null}
      </Card>
    </main>
  );
}
