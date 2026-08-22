"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { dashboardToSouthernStarHoldings } from "@/components/southernstar-adapter";
import type { DashboardData } from "@/lib/storage";
import { Card, Notice } from "@/southernstar/components";
import { defaultAllocationTargets, type AllocationTarget } from "@/southernstar/lib/allocation-drift";
import { SECTOR_COLORS, type Holding, type PortfolioScope, type Sector } from "@/southernstar/types";

type DraftTarget = Omit<AllocationTarget, "updatedAt">;
type CandidateReason = "recovery" | "drawdown" | "stale" | "missing" | "size";
type ArmedCandidate = Holding & { weight: number; score: number; reasons: CandidateReason[] };

const orderedDefaults = defaultAllocationTargets();
const scopes: Array<{ value: PortfolioScope; label: string }> = [
  { value: "overall", label: "Overall" },
  { value: "personal", label: "Personal" },
  { value: "smsf", label: "SMSF" },
];

function pct(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function money(value: number, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function signedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}${money(Math.abs(value))}`;
}

function normaliseDraft(targets: AllocationTarget[]): DraftTarget[] {
  const map = new Map<Sector, number>(targets.map((target) => [target.sector, target.targetPercent]));
  return orderedDefaults.map((target) => ({
    sector: target.sector,
    targetPercent: map.get(target.sector) ?? target.targetPercent,
  }));
}

function ownerLabel(owner: Holding["ownerType"]) {
  return owner === "SMSF" ? "SMSF" : "Personal";
}

function priceAgeDays(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (Date.now() - time) / 86_400_000);
}

function signalLabel(reason: CandidateReason) {
  switch (reason) {
    case "recovery": return "Bouncing";
    case "drawdown": return "Drawdown";
    case "stale": return "Stale price";
    case "missing": return "No price";
    case "size": return "Size check";
  }
}

function buildArmedCandidates(holdings: Holding[], scope: PortfolioScope): ArmedCandidate[] {
  const filtered = holdings.filter((holding) => {
    if (holding.sector === "Cash" || holding.broker === "Physical") return false;
    if (scope === "personal" && holding.ownerType !== "PERSONAL") return false;
    if (scope === "smsf" && holding.ownerType !== "SMSF") return false;
    return true;
  });
  const total = filtered.reduce((sum, holding) => sum + holding.marketValueAud, 0) || 1;

  return filtered.map((holding) => {
    const weight = holding.marketValueAud / total * 100;
    const dayPct = holding.marketValueAud ? ((holding.dayGainAud ?? 0) / holding.marketValueAud) * 100 : 0;
    const age = priceAgeDays(holding.priceAsOfDate);
    const reasons: CandidateReason[] = [];
    let score = 0;

    if (holding.lastPrice == null || holding.lastPrice <= 0) {
      reasons.push("missing");
      score += 45;
    } else if (age != null && age > 3) {
      reasons.push("stale");
      score += Math.min(35, age * 3);
    }

    if (holding.pnlPercent <= -25) {
      reasons.push("drawdown");
      score += Math.min(45, Math.abs(holding.pnlPercent));
    }

    if (holding.pnlPercent < -8 && dayPct >= 1) {
      reasons.push("recovery");
      score += 34 + Math.min(16, dayPct * 3);
    }

    if (weight >= 5) {
      reasons.push("size");
      score += Math.min(20, weight * 1.5);
    }

    return { ...holding, weight, score, reasons };
  })
    .filter((candidate) => candidate.reasons.length > 0)
    .sort((a, b) => b.score - a.score || b.marketValueAud - a.marketValueAud);
}

async function loadDashboard(scope: DashboardData["scope"]): Promise<DashboardData> {
  const response = await fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load dashboard");
  return payload as DashboardData;
}

export default function AllocationTargetsPage() {
  const [targets, setTargets] = useState<DraftTarget[]>(orderedDefaults);
  const [message, setMessage] = useState("Loading targets...");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [scope, setScope] = useState<PortfolioScope>("overall");
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [holdingsError, setHoldingsError] = useState("");
  const total = useMemo(() => targets.reduce((sum, target) => sum + target.targetPercent, 0), [targets]);
  const canSave = Math.abs(total - 100) <= 0.01;
  const armedCandidates = useMemo(() => buildArmedCandidates(holdings, scope), [holdings, scope]);
  const displayedCandidates = armedCandidates.slice(0, 12);

  const loadTargets = async () => {
    const response = await fetch("/api/allocation-targets", { cache: "no-store" });
    const result = await response.json();
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setTargets(normaliseDraft(result.targets ?? []));
    setMessage("");
  };

  const loadHoldings = async () => {
    setLoadingHoldings(true);
    setHoldingsError("");
    try {
      const [personal, smsf] = await Promise.all([loadDashboard("personal"), loadDashboard("smsf")]);
      setHoldings([...dashboardToSouthernStarHoldings(personal), ...dashboardToSouthernStarHoldings(smsf)]);
    } catch (error) {
      setHoldingsError(error instanceof Error ? error.message : "Unable to load armed list");
    } finally {
      setLoadingHoldings(false);
    }
  };

  useEffect(() => {
    void loadTargets();
    void loadHoldings();
  }, []);

  const updateTarget = (sector: Sector, value: number) => {
    setTargets((current) => current.map((target) => target.sector === sector ? { ...target, targetPercent: value } : target));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("Saving...");
    const response = await fetch("/api/allocation-targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targets }),
    });
    const result = await response.json();
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setTargets(normaliseDraft(result.targets ?? []));
    setMessage("Allocation targets saved.");
  };

  return (
    <main className="shell">
      <PageHeader
        title="Armed list"
        description="Recovery candidates, stale prices and position-size checks pulled from current holdings. This is a watch surface, not an execution blotter."
        links={[
          { href: "/", label: "State of play" },
          { href: "/holdings", label: "Capital" },
          { href: "/prices", label: "Chart workbench" },
        ]}
      />

      <section className="armedHero">
        <Card className="armedSummaryCard">
          <div className="armedTopline">
            <div>
              <p className="eyebrow">Watch discipline</p>
              <h2 className="cardTitle">Candidates needing attention</h2>
            </div>
            <div className="scopeTabs compactTabs" role="tablist" aria-label="Armed list scope">
              {scopes.map((item) => (
                <button key={item.value} type="button" className={scope === item.value ? "isActive" : undefined} onClick={() => setScope(item.value)}>{item.label}</button>
              ))}
            </div>
          </div>
          <div className="armedStats">
            <div><span>Signals</span><strong>{armedCandidates.length}</strong></div>
            <div><span>Deep drawdowns</span><strong>{armedCandidates.filter((item) => item.reasons.includes("drawdown")).length}</strong></div>
            <div><span>Bouncing</span><strong>{armedCandidates.filter((item) => item.reasons.includes("recovery")).length}</strong></div>
            <div><span>Price checks</span><strong>{armedCandidates.filter((item) => item.reasons.includes("stale") || item.reasons.includes("missing")).length}</strong></div>
          </div>
        </Card>
      </section>

      {holdingsError && <Notice tone="error" title="Unable to load armed list">{holdingsError}</Notice>}

      <section className="armedGrid">
        {loadingHoldings ? (
          <Card>Loading armed list...</Card>
        ) : displayedCandidates.length ? displayedCandidates.map((candidate) => {
          const dayPct = candidate.marketValueAud ? ((candidate.dayGainAud ?? 0) / candidate.marketValueAud) * 100 : 0;
          const priceAge = priceAgeDays(candidate.priceAsOfDate);
          return (
            <Card key={candidate.id} className="armedCandidateCard">
              <div className="armedCandidateHead">
                <div>
                  <strong>{candidate.symbol}</strong>
                  <span>{candidate.name}</span>
                </div>
                <em>{ownerLabel(candidate.ownerType)} · {candidate.broker ?? "Broker"}</em>
              </div>
              <div className="armedSignalList">
                {candidate.reasons.map((reason) => <span key={reason}>{signalLabel(reason)}</span>)}
              </div>
              <dl className="armedCandidateMetrics">
                <div><dt>Value</dt><dd>{money(candidate.marketValueAud)}</dd></div>
                <div><dt>Weight</dt><dd>{pct(candidate.weight)}</dd></div>
                <div><dt>Day P/L</dt><dd className={(candidate.dayGainAud ?? 0) >= 0 ? "positive" : "negative"}>{signedMoney(candidate.dayGainAud ?? 0)} · {pct(dayPct)}</dd></div>
                <div><dt>Position P/L</dt><dd className={candidate.pnlAud >= 0 ? "positive" : "negative"}>{signedMoney(candidate.pnlAud)} · {pct(candidate.pnlPercent)}</dd></div>
                <div><dt>Latest</dt><dd>{candidate.lastPrice ? `${candidate.priceCurrency ?? ""} ${candidate.lastPrice.toLocaleString("en-AU", { maximumFractionDigits: 4 })}` : "Missing"}</dd></div>
                <div><dt>Price age</dt><dd>{priceAge == null ? "No date" : `${priceAge.toFixed(1)}d`}</dd></div>
              </dl>
              <div className="armedCardFooter">
                <span style={{ background: SECTOR_COLORS[candidate.sector] }} />
                <small>{candidate.sector}</small>
              </div>
            </Card>
          );
        }) : (
          <Card>
            <p className="eyebrow">Clear</p>
            <h2 className="cardTitle">No armed signals</h2>
            <p className="small">No holdings currently meet the drawdown, bounce, stale price or size-check rules for this scope.</p>
          </Card>
        )}
      </section>

      <section className="grid two equal targetEditorSection">
        <Card>
          <form className="form" onSubmit={submit}>
            <p className="eyebrow">Target model</p>
            <h2 className="cardTitle">Sector weights</h2>
            <div className="targetList">
              {targets.map((target) => (
                <label className="targetRow" key={target.sector}>
                  <span><i style={{ background: SECTOR_COLORS[target.sector] }} />{target.sector}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={target.targetPercent}
                    onChange={(event) => updateTarget(target.sector, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
            <div className="targetTotal">
              <strong>Total</strong>
              <span className={canSave ? "positive" : "negative"}>{pct(total, 2)}</span>
            </div>
            <div className="buttonRow">
              <button className="primary" type="submit" disabled={!canSave}>Save targets</button>
              <button type="button" onClick={() => setTargets(orderedDefaults)}>Reset defaults</button>
            </div>
            {message && <p className="small">{message}</p>}
          </form>
        </Card>

        <Card>
          <p className="eyebrow">Current policy</p>
          <h2 className="cardTitle">Target mix</h2>
          <div className="targetPreview">
            {targets.map((target) => (
              <div key={target.sector}>
                <span><i style={{ background: SECTOR_COLORS[target.sector] }} />{target.sector}</span>
                <strong>{pct(target.targetPercent, 2)}</strong>
              </div>
            ))}
          </div>
          {!canSave && <Notice tone="error" title="Targets must total 100%">Adjust the sector weights before saving.</Notice>}
        </Card>
      </section>
    </main>
  );
}
