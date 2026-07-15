"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, Notice } from "@/northstar/components";
import { defaultAllocationTargets, type AllocationTarget } from "@/northstar/lib/allocation-drift";
import { SECTOR_COLORS, type Sector } from "@/northstar/types";

type DraftTarget = Omit<AllocationTarget, "updatedAt">;

const orderedDefaults = defaultAllocationTargets();

function pct(value: number) {
  return `${value.toFixed(2)}%`;
}

function normaliseDraft(targets: AllocationTarget[]): DraftTarget[] {
  const map = new Map<Sector, number>(targets.map((target) => [target.sector, target.targetPercent]));
  return orderedDefaults.map((target) => ({
    sector: target.sector,
    targetPercent: map.get(target.sector) ?? target.targetPercent,
  }));
}

export default function AllocationTargetsPage() {
  const [targets, setTargets] = useState<DraftTarget[]>(orderedDefaults);
  const [message, setMessage] = useState("Loading targets...");
  const total = useMemo(() => targets.reduce((sum, target) => sum + target.targetPercent, 0), [targets]);
  const canSave = Math.abs(total - 100) <= 0.01;

  const load = async () => {
    const response = await fetch("/api/allocation-targets", { cache: "no-store" });
    const result = await response.json();
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setTargets(normaliseDraft(result.targets ?? []));
    setMessage("");
  };

  useEffect(() => {
    void load();
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
        title="Allocation targets"
        description="Set the target weights used by dashboard allocation drift and wealth statement exports."
        links={[
          { href: "/", label: "← Dashboard" },
          { href: "/sectors", label: "Sectors" },
          { href: "/roadmap", label: "Roadmap" },
        ]}
      />

      <section className="grid two equal">
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
              <span className={canSave ? "positive" : "negative"}>{pct(total)}</span>
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
                <strong>{pct(target.targetPercent)}</strong>
              </div>
            ))}
          </div>
          {!canSave && <Notice tone="error" title="Targets must total 100%">Adjust the sector weights before saving.</Notice>}
        </Card>
      </section>
    </main>
  );
}
