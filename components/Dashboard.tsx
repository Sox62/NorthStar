"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppHeader from "@/components/AppHeader";
import type { DashboardData, Scope } from "@/lib/storage";
import {
  BreakdownBars,
  Card,
  Kpi,
  Notice,
  ProgressBar,
  SectorTag,
  SplitBar,
  StatusBadge,
} from "@/northstar/components";

const money = (value: number, digits = 0) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const chartColours = ["#d7b56d", "#77a9d8", "#8dc6a0", "#c78db8", "#8493a3", "#dd8b6f"];
const assetColours: Record<string, string> = {
  "Precious metals": "#d7b56d",
  Uranium: "#8dc6a0",
  Energy: "#dd8b6f",
  Cash: "#5d6f81",
  "Broad equities": "#77a9d8",
};

const initial: DashboardData = {
  scope: "overall",
  storageMode: "local-file",
  totalValue: 0,
  investedValue: 0,
  cashValue: 0,
  dailyMovement: 0,
  totalReturn: 0,
  totalReturnPercent: 0,
  holdings: [],
  allocations: [],
  performance: [],
  accounts: [],
  provisionalValue: 0,
  currentValue: 0,
  lastUpdated: null,
};

const scopeName: Record<Scope, string> = {
  overall: "Consolidated portfolio",
  personal: "Personal portfolio",
  smsf: "SMSF portfolio",
};

export default function Dashboard() {
  const [scope, setScope] = useState<Scope>("overall");
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (result.error) throw new Error(result.error);
        setData(result);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load dashboard"))
      .finally(() => setLoading(false));
  }, [scope]);

  const capitalSegments = useMemo(
    () => [
      {
        label: "Invested",
        value: data.investedValue,
        display: money(data.investedValue),
        color: "#d7b56d",
        pct: data.totalValue ? Number(((data.investedValue / data.totalValue) * 100).toFixed(1)) : 0,
      },
      {
        label: "Available cash",
        value: data.cashValue,
        display: money(data.cashValue),
        color: "#5d6f81",
        pct: data.totalValue ? Number(((data.cashValue / data.totalValue) * 100).toFixed(1)) : 0,
      },
    ],
    [data.cashValue, data.investedValue, data.totalValue],
  );

  const allocationItems = useMemo(
    () =>
      data.allocations.map((allocation, index) => ({
        label: allocation.name,
        value: allocation.amount,
        display: `${money(allocation.amount)} · ${allocation.value.toFixed(1)}%`,
        color: assetColours[allocation.name] ?? chartColours[index % chartColours.length],
      })),
    [data.allocations],
  );

  const status = data.provisionalValue ? "Part provisional" : data.totalValue ? "Current" : "Awaiting imports";

  return (
    <main className="shell">
      <AppHeader scope={scope} onScopeChange={setScope} />

      {error && <Notice tone="error" title="Unable to load NorthStar">{error}</Notice>}

      {loading ? (
        <Card className="empty loadingCard">Loading NorthStar…</Card>
      ) : (
        <>
          <section className="portfolioHero" aria-label="Portfolio summary">
            <div className="heroValueBlock">
              <div className="heroHeadingRow">
                <div>
                  <p className="eyebrow">{scopeName[scope]}</p>
                  <h2>Portfolio value</h2>
                </div>
                <StatusBadge tone={data.provisionalValue ? "warning" : "good"}>{status}</StatusBadge>
              </div>
              <div className="heroValue">{money(data.totalValue)}</div>
              <div className="heroSubline">
                <span>{data.holdings.length} positions</span>
                <span>{data.accounts.length} data sources</span>
                <span>{data.storageMode === "postgresql" ? "Railway PostgreSQL" : "Local application file"}</span>
              </div>
            </div>

            <div className="heroKpis">
              <Kpi
                label="Daily movement"
                value={`${data.dailyMovement >= 0 ? "+" : ""}${money(data.dailyMovement)}`}
                tone={data.dailyMovement >= 0 ? "positive" : "negative"}
                note="Latest recorded session"
              />
              <Kpi
                label="Total return"
                value={`${data.totalReturn >= 0 ? "+" : ""}${money(data.totalReturn)}`}
                tone={data.totalReturn >= 0 ? "positive" : "negative"}
                note={`${data.totalReturnPercent.toFixed(2)}% since acquisition`}
              />
              <Kpi label="Available cash" value={money(data.cashValue)} note="Immediately deployable" />
              <Kpi label="Invested capital" value={money(data.investedValue)} note="Current marked value" />
            </div>
          </section>

          {!data.totalValue && (
            <Card className="onboarding onboardingRedesign">
              <div>
                <p className="eyebrow">Build the first view</p>
                <h2 className="cardTitle">Bring your investment records together</h2>
                <p>
                  Sync IBKR, import Directshares, add Macquarie cash and record physical platinum. NorthStar keeps Personal and SMSF ownership legally separate at every level.
                </p>
              </div>
              <div className="buttonRow">
                <Link className="button primary" href="/imports">Import broker data</Link>
                <Link className="button" href="/cash">Add cash position</Link>
                <Link className="button" href="/assets">Add physical platinum</Link>
              </div>
            </Card>
          )}

          <section className="dashboardGrid dashboardGridTop">
            <Card className="panel historyPanel">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Performance</p>
                  <h2 className="cardTitle">Portfolio history</h2>
                  <p className="cardIntro">Recorded value through time for the selected ownership scope.</p>
                </div>
                {data.lastUpdated && (
                  <span className="panelTimestamp">
                    Updated {new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.lastUpdated))}
                  </span>
                )}
              </div>
              {data.performance.length ? (
                <div className="chart chartLarge">
                  <ResponsiveContainer>
                    <LineChart data={data.performance} margin={{ top: 24, right: 20, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(142,160,178,0.15)" vertical={false} />
                      <XAxis dataKey="date" stroke="#8ea0b2" tickLine={false} axisLine={false} />
                      <YAxis stroke="#8ea0b2" tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                      <Tooltip
                        formatter={(value) => money(Number(value))}
                        contentStyle={{ background: "#081019", border: "1px solid #304255", borderRadius: 14, boxShadow: "0 18px 38px rgba(0,0,0,.35)" }}
                        labelStyle={{ color: "#cbd6df" }}
                      />
                      {scope === "overall" && <Line type="monotone" dataKey="overall" name="Overall" stroke="#d7b56d" strokeWidth={3} dot={data.performance.length < 3} connectNulls />}
                      {scope !== "smsf" && <Line type="monotone" dataKey="personal" name="Personal" stroke="#77a9d8" strokeWidth={2.4} dot={data.performance.length < 3} connectNulls />}
                      {scope !== "personal" && <Line type="monotone" dataKey="smsf" name="SMSF" stroke="#8dc6a0" strokeWidth={2.4} dot={data.performance.length < 3} connectNulls />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="emptyStateCompact">History begins when the first import or cash balance is saved.</div>
              )}
            </Card>

            <Card className="panel allocationPanel">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Capital structure</p>
                  <h2 className="cardTitle">Deployment & allocation</h2>
                </div>
              </div>

              <div className="allocationSection">
                <div className="sectionLabelRow"><span>Invested versus cash</span><strong>{data.totalValue ? ((data.investedValue / data.totalValue) * 100).toFixed(1) : "0.0"}% deployed</strong></div>
                <SplitBar segments={capitalSegments} />
              </div>

              <div className="allocationSection allocationSectionBordered">
                <div className="sectionLabelRow"><span>Asset-class exposure</span><strong>{data.allocations.length} groups</strong></div>
                {data.allocations.length ? (
                  <>
                    <div className="donutWrap">
                      <div className="chart chartDonut">
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie data={data.allocations} dataKey="amount" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={3} stroke="none">
                              {data.allocations.map((allocation, index) => (
                                <Cell key={allocation.name} fill={assetColours[allocation.name] ?? chartColours[index % chartColours.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value, _name, item) => [money(Number(value)), `${item.payload.name} · ${item.payload.value.toFixed(1)}%`]}
                              contentStyle={{ background: "#081019", border: "1px solid #304255", borderRadius: 14 }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="donutCentre">
                        <strong>{money(data.investedValue)}</strong>
                        <span>invested</span>
                      </div>
                    </div>
                    <BreakdownBars items={allocationItems} />
                  </>
                ) : (
                  <div className="emptyStateCompact">Allocation appears after data is imported.</div>
                )}
              </div>
            </Card>
          </section>

          {data.provisionalValue > 0 && (
            <Notice tone="neutral" title={`${money(data.provisionalValue)} is provisional IBKR value`}>
              NorthStar is using cost basis for any position not supplied by IBKR Open Positions or another current price source.
            </Notice>
          )}

          <section className="dashboardGrid dashboardGridBottom">
            <Card className="panel holdingsPanel">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Exposure register</p>
                  <h2 className="cardTitle">Largest positions</h2>
                  <p className="cardIntro">Ranked by current AUD market value in this view.</p>
                </div>
                <span className="panelCount">Top {Math.min(data.holdings.length, 12)} of {data.holdings.length}</span>
              </div>

              {data.holdings.length ? (
                <div className="holdingsTable" role="table" aria-label="Largest portfolio positions">
                  <div className="holdingsHeader" role="row">
                    <span>Position</span><span>Owner</span><span>Weight</span><span>Value</span><span>Return</span>
                  </div>
                  {data.holdings.slice(0, 12).map((holding) => (
                    <div className="holdingRow" role="row" key={holding.id}>
                      <div className="holdingIdentity">
                        <strong>{holding.symbol}</strong>
                        <span>{holding.name !== holding.symbol ? holding.name : holding.broker}</span>
                        <div className="holdingTags">
                          <SectorTag label={holding.assetClass} color={assetColours[holding.assetClass] ?? "#8ea0b2"} />
                          {holding.valuationBasis === "cost_basis" && <StatusBadge tone="warning">Provisional</StatusBadge>}
                        </div>
                      </div>
                      <div className="holdingOwner">
                        <span>{holding.ownerType === "SMSF" ? "SMSF" : "Personal"}</span>
                        <small>{holding.broker}</small>
                      </div>
                      <div className="holdingWeight">
                        <strong>{holding.weight.toFixed(1)}%</strong>
                        <ProgressBar percent={holding.weight} />
                      </div>
                      <div className="holdingAmount"><strong>{money(holding.marketValueAud)}</strong></div>
                      <div className={`holdingReturn ${holding.pnlAud >= 0 ? "positive" : "negative"}`}>
                        {holding.valuationBasis === "market" ? `${holding.pnlAud >= 0 ? "+" : ""}${money(holding.pnlAud)}` : "Cost basis"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="emptyStateCompact">No positions saved for this view.</div>
              )}
            </Card>

            <Card className="panel sourcesPanel">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Data integrity</p>
                  <h2 className="cardTitle">Accounts & sources</h2>
                </div>
              </div>
              <div className="sourceList">
                {data.accounts.length ? data.accounts.map((account, index) => (
                  <div className="sourceRow" key={`${account.name}-${index}`}>
                    <div className="sourceIcon" aria-hidden="true">{index + 1}</div>
                    <div>
                      <strong>{account.name}</strong>
                      <span>{account.detail}</span>
                    </div>
                    <StatusBadge>{account.status}</StatusBadge>
                  </div>
                )) : <div className="emptyStateCompact">No accounts connected yet.</div>}
              </div>
              <div className="sourceFooter">
                <span>Storage</span>
                <strong>{data.storageMode === "postgresql" ? "PostgreSQL" : "Local application file"}</strong>
              </div>
              <div className="sourceActions">
                <Link href="/imports" className="button primary">Manage imports</Link>
                <Link href="/cash" className="button">Cash accounts</Link>
              </div>
            </Card>
          </section>
        </>
      )}
    </main>
  );
}
