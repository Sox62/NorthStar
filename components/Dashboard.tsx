"use client";

import { useEffect, useState } from "react";
import type { DashboardData } from "@/lib/storage";
import { Card, Notice, OverviewScreen } from "@/northstar/components";
import type { Holding } from "@/northstar/types";
import { dashboardToAccountSummary, dashboardToNorthstarHoldings, type AccountSummary } from "./northstar-adapter";

async function loadDashboard(scope: DashboardData["scope"]): Promise<DashboardData> {
  const response = await fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load dashboard");
  return payload as DashboardData;
}

export default function Dashboard() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [performance, setPerformance] = useState<DashboardData["performance"]>([]);
  const [periodReturnsByScope, setPeriodReturnsByScope] = useState<Partial<Record<DashboardData["scope"], DashboardData["periodReturns"]>>>({});
  const [currencyExposureByScope, setCurrencyExposureByScope] = useState<Partial<Record<DashboardData["scope"], DashboardData["currencyExposure"]>>>({});
  const [allocationTargets, setAllocationTargets] = useState<DashboardData["allocationTargets"]>([]);
  const [accountBreakdown, setAccountBreakdown] = useState<AccountSummary[]>([]);
  const [syncRuns, setSyncRuns] = useState<DashboardData["syncRuns"]>([]);
  const [freshnessByScope, setFreshnessByScope] = useState<Partial<Record<DashboardData["scope"], DashboardData["freshness"]>>>({});
  const [lastUpdatedByScope, setLastUpdatedByScope] = useState<Partial<Record<DashboardData["scope"], DashboardData["lastUpdated"]>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [overall, personal, smsf] = await Promise.all([loadDashboard("overall"), loadDashboard("personal"), loadDashboard("smsf")]);
        if (!cancelled) {
          setHoldings([...dashboardToNorthstarHoldings(personal), ...dashboardToNorthstarHoldings(smsf)]);
          setPerformance(overall.performance ?? []);
          setPeriodReturnsByScope({ overall: overall.periodReturns ?? [], personal: personal.periodReturns ?? [], smsf: smsf.periodReturns ?? [] });
          setCurrencyExposureByScope({ overall: overall.currencyExposure ?? [], personal: personal.currencyExposure ?? [], smsf: smsf.currencyExposure ?? [] });
          setAllocationTargets(overall.allocationTargets ?? []);
          setAccountBreakdown([dashboardToAccountSummary(personal, overall.totalValue), dashboardToAccountSummary(smsf, overall.totalValue)].filter((item): item is AccountSummary => item !== null));
          setSyncRuns(overall.syncRuns ?? []);
          setFreshnessByScope({ overall: overall.freshness ?? [], personal: personal.freshness ?? [], smsf: smsf.freshness ?? [] });
          setLastUpdatedByScope({ overall: overall.lastUpdated ?? null, personal: personal.lastUpdated ?? null, smsf: smsf.lastUpdated ?? null });
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load NorthStar");
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
        <Card>Loading NorthStar...</Card>
      </main>
    );
  }

  if (error) {
    return (
      <main className="nsScreenMain nsLoadingState">
        <Notice tone="error" title="Unable to load NorthStar">{error}</Notice>
      </main>
    );
  }

  return <OverviewScreen holdings={holdings} performance={performance} periodReturnsByScope={periodReturnsByScope} currencyExposureByScope={currencyExposureByScope} allocationTargets={allocationTargets} accountBreakdown={accountBreakdown} syncRuns={syncRuns} freshnessByScope={freshnessByScope} lastUpdatedByScope={lastUpdatedByScope} />;
}
