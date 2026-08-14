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

type StarterResponse = FundamentalsResponse & {
  imported?: number;
  symbols?: string[];
};

type SaveFundamentalsResponse = {
  fundamental?: MinerFundamentals;
  error?: string;
};

type ResearchFormState = {
  symbol: string;
  name: string;
  primaryMetal: string;
  jurisdiction: string;
  projectStage: string;
  productionOz: string;
  aiscUsdPerOz: string;
  resourceMoz: string;
  reserveMoz: string;
  cashAud: string;
  debtAud: string;
  marketCapAud: string;
  npvAud: string;
  capexAud: string;
  irrPercent: string;
  jurisdictionScore: string;
  balanceSheetScore: string;
  dilutionScore: string;
  managementScore: string;
  sourceUrl: string;
  asOfDate: string;
  notes: string;
};

type MetricDefinition = {
  label: string;
  field: string;
  reason: string;
};

const minerSectors: Sector[] = ["Silver miners", "Gold miners", "Uranium miners", "Uranium explorers"];

const blankResearchForm: ResearchFormState = {
  symbol: "",
  name: "",
  primaryMetal: "",
  jurisdiction: "",
  projectStage: "",
  productionOz: "",
  aiscUsdPerOz: "",
  resourceMoz: "",
  reserveMoz: "",
  cashAud: "",
  debtAud: "",
  marketCapAud: "",
  npvAud: "",
  capexAud: "",
  irrPercent: "",
  jurisdictionScore: "",
  balanceSheetScore: "",
  dilutionScore: "",
  managementScore: "",
  sourceUrl: "",
  asOfDate: "",
  notes: "",
};

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

async function loadFundamentals(symbols?: string[]): Promise<MinerFundamentals[]> {
  const query = symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : "";
  const response = await fetch(`/api/fundamentals${query}`, { cache: "no-store" });
  const payload = await response.json() as FundamentalsResponse;
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load fundamentals ledger");
  return payload.fundamentals ?? [];
}

async function loadStarterFundamentals(): Promise<MinerFundamentals[]> {
  const response = await fetch("/api/fundamentals/starter", { method: "POST", cache: "no-store" });
  const payload = await response.json() as StarterResponse;
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load starter fundamentals");
  return payload.fundamentals ?? [];
}

function formValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function formNumber(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? Number(trimmed) : null;
}

async function saveResearchFundamentals(form: ResearchFormState): Promise<MinerFundamentals> {
  const response = await fetch("/api/fundamentals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: form.symbol,
      name: formValue(form.name),
      primaryMetal: formValue(form.primaryMetal),
      jurisdiction: formValue(form.jurisdiction),
      projectStage: formValue(form.projectStage),
      productionOz: formNumber(form.productionOz),
      aiscUsdPerOz: formNumber(form.aiscUsdPerOz),
      resourceMoz: formNumber(form.resourceMoz),
      reserveMoz: formNumber(form.reserveMoz),
      cashAud: formNumber(form.cashAud),
      debtAud: formNumber(form.debtAud),
      marketCapAud: formNumber(form.marketCapAud),
      npvAud: formNumber(form.npvAud),
      capexAud: formNumber(form.capexAud),
      irrPercent: formNumber(form.irrPercent),
      jurisdictionScore: formNumber(form.jurisdictionScore),
      balanceSheetScore: formNumber(form.balanceSheetScore),
      dilutionScore: formNumber(form.dilutionScore),
      managementScore: formNumber(form.managementScore),
      sourceUrl: formValue(form.sourceUrl),
      asOfDate: formValue(form.asOfDate),
      notes: form.notes.trim(),
    }),
  });
  const payload = await response.json() as SaveFundamentalsResponse;
  if (!response.ok || payload.error || !payload.fundamental) throw new Error(payload.error || "Unable to save research idea");
  return payload.fundamental;
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
  const [starterStatus, setStarterStatus] = useState<{ loading: boolean; message: string; error: string }>({ loading: false, message: "", error: "" });
  const [researchForm, setResearchForm] = useState<ResearchFormState>(blankResearchForm);
  const [researchStatus, setResearchStatus] = useState<{ saving: boolean; message: string; error: string }>({ saving: false, message: "", error: "" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const [personal, smsf] = await Promise.all([loadDashboard("personal"), loadDashboard("smsf")]);
        const nextHoldings = [...dashboardToNorthstarHoldings(personal), ...dashboardToNorthstarHoldings(smsf)].filter(isMinerHolding);
        const nextFundamentals = await loadFundamentals();
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
  const researchFundamentals = useMemo(() => {
    const heldSymbols = new Set(sortedHoldings.map((holding) => holding.symbol.toUpperCase()));
    return fundamentals.filter((item) => !heldSymbols.has(item.symbol.toUpperCase()));
  }, [fundamentals, sortedHoldings]);

  function updateResearchField<K extends keyof ResearchFormState>(field: K, value: ResearchFormState[K]) {
    setResearchForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSaveResearchIdea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResearchStatus({ saving: true, message: "", error: "" });
    try {
      const next = await saveResearchFundamentals(researchForm);
      setState((current) => {
        const bySymbol = new Map(current.fundamentals.map((item) => [item.symbol.toUpperCase(), item]));
        bySymbol.set(next.symbol.toUpperCase(), next);
        return { ...current, fundamentals: [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)) };
      });
      setResearchForm(blankResearchForm);
      setResearchStatus({ saving: false, message: `Saved ${next.symbol} as a research idea.`, error: "" });
    } catch (reason) {
      setResearchStatus({ saving: false, message: "", error: reason instanceof Error ? reason.message : "Unable to save research idea" });
    }
  }

  async function handleLoadStarterFundamentals() {
    setStarterStatus({ loading: true, message: "", error: "" });
    try {
      const nextFundamentals = await loadStarterFundamentals();
      setState((current) => {
        const bySymbol = new Map(current.fundamentals.map((item) => [item.symbol.toUpperCase(), item]));
        for (const item of nextFundamentals) bySymbol.set(item.symbol.toUpperCase(), item);
        return { ...current, fundamentals: [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)) };
      });
      setStarterStatus({ loading: false, message: `Loaded ${nextFundamentals.map((item) => item.symbol).join(", ")} from source records.`, error: "" });
    } catch (reason) {
      setStarterStatus({ loading: false, message: "", error: reason instanceof Error ? reason.message : "Unable to load starter fundamentals" });
    }
  }

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
              ["Research ideas", loading ? "..." : String(researchFundamentals.length)],
            ]}
          />
        </Card>

        <Card>
          <p className="eyebrow">Edge score inputs</p>
          <h2 className="cardTitle">No score until data is sourced</h2>
          <p className="cardIntro">The methodology needs company-level fundamentals, not just broker prices. This keeps the risk framework useful without pretending the feed already knows mine economics.</p>
          <button className="fundamentalsStarterAction" type="button" onClick={handleLoadStarterFundamentals} disabled={starterStatus.loading}>
            {starterStatus.loading ? "Refreshing records" : "Refresh sourced records"}
          </button>
          {starterStatus.message ? <p className="fundamentalsStarterMessage">{starterStatus.message}</p> : null}
          {starterStatus.error ? <p className="fundamentalsStarterMessage isError">{starterStatus.error}</p> : null}
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
                      <small>{saved?.notes ?? (saved?.asOfDate ? `As of ${dateOrDash(saved.asOfDate)}` : "Production, AISC, resource oz and source date needed.")}</small>
                      {saved?.sourceUrl ? <a className="fundamentalsSourceLink" href={saved.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && !sortedHoldings.length ? <p className="empty">No miner holdings are available for this workbench.</p> : null}
      </Card>

      <Card className="fundamentalsResearchFormCard">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Research intake</p>
            <h2 className="cardTitle">Add a miner idea</h2>
          </div>
          <StatusBadge tone={researchStatus.message ? "good" : "warning"}>{researchStatus.saving ? "Saving" : "Manual source"}</StatusBadge>
        </div>
        <form className="fundamentalsResearchForm" onSubmit={handleSaveResearchIdea}>
          <label><span>Symbol</span><input value={researchForm.symbol} onChange={(event) => updateResearchField("symbol", event.target.value.toUpperCase())} placeholder="PAAS" required /></label>
          <label><span>Name</span><input value={researchForm.name} onChange={(event) => updateResearchField("name", event.target.value)} placeholder="Pan American Silver" /></label>
          <label><span>Metal / theme</span><input value={researchForm.primaryMetal} onChange={(event) => updateResearchField("primaryMetal", event.target.value)} placeholder="Silver" /></label>
          <label><span>Jurisdiction</span><input value={researchForm.jurisdiction} onChange={(event) => updateResearchField("jurisdiction", event.target.value)} placeholder="Mexico, Peru, Canada" /></label>
          <label><span>Stage</span><input value={researchForm.projectStage} onChange={(event) => updateResearchField("projectStage", event.target.value)} placeholder="Producer" /></label>
          <label><span>As of</span><input type="date" value={researchForm.asOfDate} onChange={(event) => updateResearchField("asOfDate", event.target.value)} /></label>
          <label><span>Production oz</span><input inputMode="decimal" value={researchForm.productionOz} onChange={(event) => updateResearchField("productionOz", event.target.value)} placeholder="12000000" /></label>
          <label><span>AISC USD/oz</span><input inputMode="decimal" value={researchForm.aiscUsdPerOz} onChange={(event) => updateResearchField("aiscUsdPerOz", event.target.value)} placeholder="18.50" /></label>
          <label><span>Resource Moz</span><input inputMode="decimal" value={researchForm.resourceMoz} onChange={(event) => updateResearchField("resourceMoz", event.target.value)} placeholder="100" /></label>
          <label><span>Reserve Moz</span><input inputMode="decimal" value={researchForm.reserveMoz} onChange={(event) => updateResearchField("reserveMoz", event.target.value)} placeholder="50" /></label>
          <label><span>Cash A$</span><input inputMode="decimal" value={researchForm.cashAud} onChange={(event) => updateResearchField("cashAud", event.target.value)} /></label>
          <label><span>Debt A$</span><input inputMode="decimal" value={researchForm.debtAud} onChange={(event) => updateResearchField("debtAud", event.target.value)} /></label>
          <label><span>Jurisdiction score</span><input inputMode="numeric" min="0" max="5" value={researchForm.jurisdictionScore} onChange={(event) => updateResearchField("jurisdictionScore", event.target.value)} placeholder="0-5" /></label>
          <label><span>Balance score</span><input inputMode="numeric" min="0" max="5" value={researchForm.balanceSheetScore} onChange={(event) => updateResearchField("balanceSheetScore", event.target.value)} placeholder="0-5" /></label>
          <label><span>Dilution score</span><input inputMode="numeric" min="0" max="5" value={researchForm.dilutionScore} onChange={(event) => updateResearchField("dilutionScore", event.target.value)} placeholder="0-5" /></label>
          <label><span>Management score</span><input inputMode="numeric" min="0" max="5" value={researchForm.managementScore} onChange={(event) => updateResearchField("managementScore", event.target.value)} placeholder="0-5" /></label>
          <label className="isWide"><span>Source URL</span><input value={researchForm.sourceUrl} onChange={(event) => updateResearchField("sourceUrl", event.target.value)} placeholder="https://..." /></label>
          <label className="isWide"><span>Notes</span><textarea value={researchForm.notes} onChange={(event) => updateResearchField("notes", event.target.value)} rows={3} placeholder="What was sourced, what is judgement, what needs checking next." /></label>
          <div className="buttonRow fundamentalsResearchActions">
            <button className="primary" type="submit" disabled={researchStatus.saving}>{researchStatus.saving ? "Saving" : "Save research idea"}</button>
            <button type="button" onClick={() => setResearchForm(blankResearchForm)} disabled={researchStatus.saving}>Clear</button>
          </div>
        </form>
        {researchStatus.message ? <p className="fundamentalsStarterMessage">{researchStatus.message}</p> : null}
        {researchStatus.error ? <p className="fundamentalsStarterMessage isError">{researchStatus.error}</p> : null}
      </Card>

      <Card className="fundamentalsTableCard">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Research ideas</p>
            <h2 className="cardTitle">Saved fundamentals not currently held</h2>
          </div>
          <StatusBadge tone={researchFundamentals.length ? "good" : "warning"}>
            {loading ? "Loading" : `${researchFundamentals.length} ideas`}
          </StatusBadge>
        </div>

        <div className="holdingsTableWrap">
          <table className="holdingsTable fundamentalsTable">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Theme</th>
                <th>Stage</th>
                <th>Core inputs</th>
                <th>Risk score</th>
                <th>Source notes</th>
              </tr>
            </thead>
            <tbody>
              {researchFundamentals.map((item) => {
                const score = averageScore(item);
                return (
                  <tr key={item.symbol}>
                    <td>
                      <strong>{item.symbol}</strong>
                      <span>{item.name ?? "Research candidate"}</span>
                    </td>
                    <td>{item.primaryMetal ?? "Metal needed"}</td>
                    <td>
                      <span>{item.projectStage ?? "Stage needed"}</span>
                      <small>{item.jurisdiction ?? "Jurisdiction needed"}</small>
                    </td>
                    <td>
                      <span>AISC {numberOrDash(item.aiscUsdPerOz, " USD/oz")} · Resource {numberOrDash(item.resourceMoz, " Moz")}</span>
                      <small>Reserve {numberOrDash(item.reserveMoz, " Moz")} · NPV {moneyOrDash(item.npvAud)}</small>
                    </td>
                    <td>
                      <StatusBadge tone={score == null ? "warning" : "good"}>{score == null ? "No score" : `${score.toFixed(1)} / 5`}</StatusBadge>
                    </td>
                    <td>
                      <span>{item.notes ?? "Source notes needed."}</span>
                      <small>{item.asOfDate ? `As of ${dateOrDash(item.asOfDate)}` : "No source date"}</small>
                      {item.sourceUrl ? <a className="fundamentalsSourceLink" href={item.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && !researchFundamentals.length ? <p className="empty">No saved research ideas outside current holdings yet.</p> : null}
      </Card>
    </main>
  );
}
