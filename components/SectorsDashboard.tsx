"use client";

import { useEffect, useState } from "react";
import type { DashboardData } from "@/lib/storage";
import { Card, Notice, SectorsScreen } from "@/northstar/components";
import type { Holding } from "@/northstar/types";
import { dashboardToNorthstarHoldings } from "./northstar-adapter";

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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [personal, smsf] = await Promise.all([loadDashboard("personal"), loadDashboard("smsf")]);
        if (!cancelled) setHoldings([...dashboardToNorthstarHoldings(personal), ...dashboardToNorthstarHoldings(smsf)]);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load sectors");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
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

  return <SectorsScreen holdings={holdings} />;
}
