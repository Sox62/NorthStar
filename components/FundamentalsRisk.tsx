"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, Notice, SummaryGrid } from "@/northstar/components";
import type { Holding } from "@/northstar/types";
import { dashboardToNorthstarHoldings } from "./northstar-adapter";
import { HeldMinerTable, ResearchIdeasTable } from "./fundamentals/FundamentalsTables";
import { FundamentalsDetail } from "./fundamentals/FundamentalsDetail";
import { ResearchIntakeForm } from "./fundamentals/ResearchIntakeForm";
import {
  blankResearchForm,
  checklist,
  isMinerHolding,
  loadDashboard,
  loadFundamentals,
  loadStarterFundamentals,
  metricDefinitions,
  researchFormForHolding,
  RESEARCH_FORM_ID,
  money,
  saveResearchFundamentals,
  topRisk,
  totalValue,
  type FundamentalsState,
  type ResearchFormState,
} from "./fundamentals/model";
import styles from "./fundamentals/FundamentalsRisk.module.css";

export default function FundamentalsRisk() {
  const [{ holdings, fundamentals, loading, error }, setState] = useState<FundamentalsState>({ holdings: [], fundamentals: [], loading: true, error: "" });
  const [starterStatus, setStarterStatus] = useState<{ loading: boolean; message: string; error: string }>({ loading: false, message: "", error: "" });
  const [researchForm, setResearchForm] = useState<ResearchFormState>(blankResearchForm);
  const [researchStatus, setResearchStatus] = useState<{ saving: boolean; message: string; error: string }>({ saving: false, message: "", error: "" });
  const [selected, setSelected] = useState<Holding | null>(null);

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
    return () => { cancelled = true; };
  }, []);

  const sortedHoldings = useMemo(() => [...holdings].sort((a, b) => b.marketValueAud - a.marketValueAud), [holdings]);
  const value = totalValue(sortedHoldings);
  const largest = topRisk(sortedHoldings);
  const sectors = useMemo(() => {
    const totals = new Map<string, number>();
    for (const holding of sortedHoldings) totals.set(holding.sector, (totals.get(holding.sector) ?? 0) + holding.marketValueAud);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [sortedHoldings]);
  const fundamentalsBySymbol = useMemo(() => new Map(fundamentals.map((item) => [item.symbol.toUpperCase(), item])), [fundamentals]);
  const researchFundamentals = useMemo(() => {
    const heldSymbols = new Set(sortedHoldings.map((holding) => holding.symbol.toUpperCase()));
    return fundamentals.filter((item) => !heldSymbols.has(item.symbol.toUpperCase()));
  }, [fundamentals, sortedHoldings]);

  function handleEditFundamentals(holding: Holding) {
    setResearchForm(researchFormForHolding(holding, fundamentalsBySymbol.get(holding.symbol.toUpperCase())));
    setResearchStatus({ saving: false, message: "", error: "" });
    setSelected(null);
    // The form sits well below the queue, so move to it rather than leaving the user to hunt.
    requestAnimationFrame(() => {
      document.getElementById(RESEARCH_FORM_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function updateResearchField<K extends keyof ResearchFormState>(field: K, value: ResearchFormState[K]) {
    setResearchForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSaveResearchIdea(event: FormEvent<HTMLFormElement>) {
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
        description="A disciplined miner checklist and data capture surface. Edge scores stay blank until SouthernStar has source fundamentals, so this screen does not invent conviction."
        links={[
          { href: "/", label: "State of play" },
          { href: "/holdings", label: "Capital" },
          { href: "/targets", label: "Armed list" },
        ]}
      />

      {error ? <Notice tone="error" title="Unable to load fundamentals">{error}</Notice> : null}

      <section className={styles.hero}>
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
          <button className={styles.starterAction} type="button" onClick={handleLoadStarterFundamentals} disabled={starterStatus.loading}>
            {starterStatus.loading ? "Refreshing records" : "Refresh sourced records"}
          </button>
          {starterStatus.message ? <p className={styles.message}>{starterStatus.message}</p> : null}
          {starterStatus.error ? <p className={`${styles.message} ${styles.messageError}`}>{starterStatus.error}</p> : null}
          <div className={styles.checklist}>
            {checklist.map((item) => <span key={item}>{item}</span>)}
          </div>
        </Card>
      </section>

      <section className={styles.metricGrid} aria-label="Fundamentals metrics">
        {metricDefinitions.map((metric) => (
          <Card key={metric.label} className={styles.metric}>
            <p className="eyebrow">{metric.label}</p>
            <strong>{metric.field}</strong>
            <span>{metric.reason}</span>
          </Card>
        ))}
      </section>

      <HeldMinerTable
        holdings={sortedHoldings}
        fundamentalsBySymbol={fundamentalsBySymbol}
        loading={loading}
        totalMinerValue={value}
        onSelect={setSelected}
      />

      <ResearchIntakeForm
        form={researchForm}
        status={researchStatus}
        onChange={updateResearchField}
        onSubmit={handleSaveResearchIdea}
        onClear={() => setResearchForm(blankResearchForm)}
      />

      <ResearchIdeasTable ideas={researchFundamentals} loading={loading} />

      {selected ? (
        <FundamentalsDetail
          holding={selected}
          fundamentals={fundamentalsBySymbol.get(selected.symbol.toUpperCase())}
          onClose={() => setSelected(null)}
          onEdit={handleEditFundamentals}
        />
      ) : null}
    </main>
  );
}
