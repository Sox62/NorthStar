"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
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

const money = (value: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
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

  return (
    <main className="shell">
      <AppHeader scope={scope} onScopeChange={setScope} />

      {error && <Notice tone="error" title="Unable to load NorthStar">{error}</Notice>}

      {loading ? (
        <Card className="empty">Loading NorthStar…</Card>
      ) : (
        <>
          <section className="grid kpis" aria-label="Portfolio summary">
            <Kpi label="Total value" value={money(data.totalValue)} />
            <Kpi
              label="Daily movement"
              value={`${data.dailyMovement >= 0 ? "+" : ""}${money(data.dailyMovement)}`}
              tone={data.dailyMovement >= 0 ? "positive" : "negative"}
            />
            <Kpi
              label="Total return"
              value={`${data.totalReturn >= 0 ? "+" : ""}${money(data.totalReturn)} · ${data.totalReturnPercent.toFixed(2)}%`}
              tone={data.totalReturn >= 0 ? "positive" : "negative"}
            />
            <Kpi label="Available cash" value={money(data.cashValue)} />
            <Kpi
              label="Data status"
              value={data.provisionalValue ? "Part provisional" : data.totalValue ? "Current" : "Awaiting imports"}
              tone={data.provisionalValue ? "warning" : "default"}
              badge
            />
          </section>

          {!data.totalValue && (
            <Card className="onboarding">
              <p className="eyebrow">First steps</p>
              <h2 className="cardTitle">Start with your real data</h2>
              <p>
                Sync IBKR, import the Directshares holdings CSV, add Macquarie cash, then record any physical platinum.
                NorthStar keeps Personal and SMSF ownership legally separate in every view.
              </p>
              <div className="buttonRow">
                <Link className="button primary" href="/imports">Import broker data</Link>
                <Link className="button" href="/cash">Add cash position</Link>
                <Link className="button" href="/assets">Add physical platinum</Link>
              </div>
            </Card>
          )}

          <section className="grid two sectionStack">
            <Card>
              <p className="eyebrow">Portfolio history</p>
              <h2 className="cardTitle">Recorded value over time</h2>
              <p className="cardIntro">Daily portfolio snapshots for the selected legal ownership scope.</p>
              {data.performance.length ? (
                <div className="chart">
                  <ResponsiveContainer>
                    <LineChart data={data.performance} margin={{ top: 28, right: 18, left: 16, bottom: 0 }}>
                      <CartesianGrid stroke="#213244" vertical={false} />
                      <XAxis dataKey="date" stroke="#8ea0b2" />
                      <YAxis stroke="#8ea0b2" tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                      <Tooltip
                        formatter={(value) => money(Number(value))}
                        contentStyle={{ background: "#081019", border: "1px solid #213244", borderRadius: 10 }}
                        labelStyle={{ color: "#cbd6df" }}
                      />
                      <Legend />
                      {scope === "overall" && (
                        <Line type="monotone" dataKey="overall" name="Overall" stroke="#d7b56d" strokeWidth={3} dot={data.performance.length < 3} connectNulls />
                      )}
                      {scope !== "smsf" && (
                        <Line type="monotone" dataKey="personal" name="Personal" stroke="#77a9d8" strokeWidth={2} dot={data.performance.length < 3} connectNulls />
                      )}
                      {scope !== "personal" && (
                        <Line type="monotone" dataKey="smsf" name="SMSF" stroke="#8dc6a0" strokeWidth={2} dot={data.performance.length < 3} connectNulls />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="empty">History begins when the first import or cash balance is saved.</p>
              )}
            </Card>

            <Card>
              <p className="eyebrow">Composition</p>
              <h2 className="cardTitle">Where the portfolio sits</h2>
              <div className="compositionBlock">
                <p className="cardIntro">Invested capital versus immediately available cash.</p>
                <SplitBar segments={capitalSegments} />
              </div>
              <div className="compositionBlock">
                <p className="cardIntro">Current asset-class exposure.</p>
                {data.allocations.length ? (
                  <div className="allocationLayout">
                    <div className="chart chartCompact">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={data.allocations} dataKey="amount" nameKey="name" innerRadius={55} outerRadius={86} paddingAngle={2}>
                            {data.allocations.map((allocation, index) => (
                              <Cell key={allocation.name} fill={assetColours[allocation.name] ?? chartColours[index % chartColours.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value, _name, item) => [money(Number(value)), `${item.payload.name} · ${item.payload.value.toFixed(1)}%`]}
                            contentStyle={{ background: "#081019", border: "1px solid #213244", borderRadius: 10 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <BreakdownBars items={allocationItems} />
                  </div>
                ) : (
                  <p className="empty">Allocation appears after data is imported.</p>
                )}
              </div>
            </Card>
          </section>

          {data.provisionalValue > 0 && (
            <Notice tone="neutral" title={`${money(data.provisionalValue)} is provisional IBKR value`}>
              The Trades-only Flex file establishes quantities and remaining cost basis. NorthStar deliberately uses cost basis until an IBKR Open Positions section or a live price provider supplies current market values.
            </Notice>
          )}

          <section className="grid three sectionStack">
            <Card style={{ gridColumn: "span 2" }}>
              <p className="eyebrow">Largest positions</p>
              <h2 className="cardTitle">Current exposure</h2>
              <div className="positionList">
                {data.holdings.length ? (
                  data.holdings.slice(0, 12).map((holding) => (
                    <div className="positionRow" key={holding.id}>
                      <div>
                        <strong>{holding.symbol} <span className="mutedName">{holding.name !== holding.symbol ? holding.name : ""}</span></strong>
                        <div className="positionMeta">
                          <SectorTag label={holding.assetClass} color={assetColours[holding.assetClass] ?? "#8ea0b2"} />
                          <span className="small">{holding.ownerType === "SMSF" ? "SMSF" : "Personal"}</span>
                          <span className="small">{holding.broker}</span>
                          <span className="small">{holding.weight.toFixed(1)}% of this view</span>
                          {holding.valuationBasis === "cost_basis" && <StatusBadge tone="warning">Provisional</StatusBadge>}
                        </div>
                        <div style={{ marginTop: 9 }}>
                          <ProgressBar percent={holding.weight} width={200} />
                        </div>
                      </div>
                      <div className="positionValue">
                        <strong>{money(holding.marketValueAud)}</strong>
                        <div className={holding.pnlAud >= 0 ? "positive" : "negative"}>
                          {holding.valuationBasis === "market" ? `${holding.pnlAud >= 0 ? "+" : ""}${money(holding.pnlAud)}` : "Cost basis"}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="empty">No positions saved for this view.</p>
                )}
              </div>
            </Card>

            <Card>
              <p className="eyebrow">Accounts</p>
              <h2 className="cardTitle">Data sources</h2>
              <div className="accountList">
                {data.accounts.length ? (
                  data.accounts.map((account, index) => (
                    <div className="accountRow" key={`${account.name}-${index}`}>
                      <div>
                        <strong>{account.name}</strong>
                        <div className="small">{account.detail}</div>
                      </div>
                      <StatusBadge>{account.status}</StatusBadge>
                    </div>
                  ))
                ) : (
                  <p className="empty">No accounts connected yet.</p>
                )}
              </div>
              <div className="storageMode">Storage: {data.storageMode === "postgresql" ? "PostgreSQL" : "local application file"}</div>
            </Card>
          </section>

          {data.lastUpdated && (
            <p className="lastUpdated">
              Last updated {new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.lastUpdated))}
            </p>
          )}
        </>
      )}
    </main>
  );
}
