"use client";

import { useEffect, useState } from "react";
import type { DashboardData } from "@/lib/storage";
import { Card, Notice, SectorsScreen } from "@/northstar/components";
import type { Holding } from "@/northstar/types";
import { dashboardToNorthstarHoldings } from "./northstar-adapter";
import { SectorOverrides } from "./SectorOverrides";

async function loadDashboard(scope: "personal" | "smsf"): Promise<DashboardData> {
  const response = await fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load dashboard");
  return payload as DashboardData;
}

export default function SectorsDashboard() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [personal, smsf] = await Promise.all([loadDashboard("personal"), loadDashboard("smsf")]);
      setHoldings([...dashboardToNorthstarHoldings(personal), ...dashboardToNorthstarHoldings(smsf)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load sectors");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main className="nsScreenMain nsLoadingState">
        <Card>Loading sectors...</Card>
      </main>
    );
  }

  if (error) {
    return (
      <main className="nsScreenMain nsLoadingState">
        <Notice tone="error" title="Unable to load sectors">{error}</Notice>
      </main>
    );
  }

  return (
    <>
      <SectorsScreen holdings={holdings} />
      <div className="nsScreenMain">
        {/* Reloading the dashboard after a change is what makes the new sector show up in the
            donut and the allocation rows immediately, rather than on the next visit. */}
        <SectorOverrides holdings={holdings} onChanged={() => void load()} />
      </div>
    </>
  );
}
