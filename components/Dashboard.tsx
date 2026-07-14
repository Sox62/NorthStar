"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cell, CartesianGrid, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardData, Scope } from "@/lib/storage";

const money = (value: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
const colours = ["#d7b56d", "#77a9d8", "#8dc6a0", "#c78db8", "#8493a3", "#dd8b6f"];
const initial: DashboardData = { scope: "overall", storageMode: "local-file", totalValue: 0, investedValue: 0, cashValue: 0, dailyMovement: 0, totalReturn: 0, totalReturnPercent: 0, holdings: [], allocations: [], performance: [], accounts: [], provisionalValue: 0, currentValue: 0, lastUpdated: null };

export default function Dashboard() {
  const [scope, setScope] = useState<Scope>("overall");
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true); setError("");
    fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" })
      .then(response => response.json())
      .then(result => { if (result.error) throw new Error(result.error); setData(result); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Unable to load dashboard"))
      .finally(() => setLoading(false));
  }, [scope]);

  return <main className="shell">
    <div className="top">
      <div className="brand"><div className="star">✦</div><h1>North Star</h1><p className="motto">In Via Recta Celeriter</p><p>Personal, SMSF and consolidated investment reporting</p></div>
      <div className="topActions"><div className="tabs"><ScopeButton value="overall" current={scope} onClick={setScope}>Overall</ScopeButton><ScopeButton value="personal" current={scope} onClick={setScope}>Personal</ScopeButton><ScopeButton value="smsf" current={scope} onClick={setScope}>SMSF</ScopeButton></div><div className="links"><Link href="/imports">Import broker data</Link><Link href="/cash">Cash accounts</Link></div></div>
    </div>

    {error && <div className="result error">{error}</div>}
    {loading ? <div className="card empty">Loading North Star…</div> : <>
      <section className="grid kpis"><Kpi label="Total value" value={money(data.totalValue)} /><Kpi label="Daily movement" value={`${data.dailyMovement >= 0 ? "+" : ""}${money(data.dailyMovement)}`} cls={data.dailyMovement >= 0 ? "positive" : "negative"} /><Kpi label="Total return" value={`${data.totalReturn >= 0 ? "+" : ""}${money(data.totalReturn)} · ${data.totalReturnPercent.toFixed(2)}%`} cls={data.totalReturn >= 0 ? "positive" : "negative"} /><Kpi label="Available cash" value={money(data.cashValue)} /><Kpi label="Data status" value={data.provisionalValue ? "Part provisional" : data.totalValue ? "Current" : "Awaiting imports"} badge cls={data.provisionalValue ? "warning" : ""} /></section>

      {!data.totalValue && <section className="card onboarding"><div className="value">Start with your real data</div><p>Import the Directshares holdings CSV and IBKR Flex XML, then add Macquarie cash. The dashboard will update immediately and remain separated by legal owner.</p><div className="buttonRow"><Link className="button primary" href="/imports">Import broker data</Link><Link className="button" href="/cash">Add cash position</Link></div></section>}

      <section className="grid two" style={{ marginTop: 16 }}>
        <div className="card"><div className="label">Portfolio history</div><div className="value">Recorded value over time</div>{data.performance.length ? <div className="chart"><ResponsiveContainer><LineChart data={data.performance} margin={{ top: 28, right: 18, left: 16, bottom: 0 }}><CartesianGrid stroke="#213244" vertical={false} /><XAxis dataKey="date" stroke="#8ea0b2" /><YAxis stroke="#8ea0b2" tickFormatter={value => `${Math.round(value / 1000)}k`} /><Tooltip formatter={value => money(Number(value))} /><Legend />{scope === "overall" && <Line type="monotone" dataKey="overall" name="Overall" stroke="#d7b56d" strokeWidth={3} dot={data.performance.length < 3} connectNulls />}{scope !== "smsf" && <Line type="monotone" dataKey="personal" name="Personal" stroke="#77a9d8" strokeWidth={2} dot={data.performance.length < 3} connectNulls />}{scope !== "personal" && <Line type="monotone" dataKey="smsf" name="SMSF" stroke="#8dc6a0" strokeWidth={2} dot={data.performance.length < 3} connectNulls />}</LineChart></ResponsiveContainer></div> : <p className="empty">History begins when the first import or cash balance is saved.</p>}</div>
        <div className="card"><div className="label">Allocation</div><div className="value">By asset class</div>{data.allocations.length ? <div className="chart"><ResponsiveContainer><PieChart><Pie data={data.allocations} dataKey="amount" nameKey="name" innerRadius={66} outerRadius={105} paddingAngle={2}>{data.allocations.map((_, index) => <Cell key={index} fill={colours[index % colours.length]} />)}</Pie><Tooltip formatter={(value, _name, item) => [money(Number(value)), `${item.payload.name} · ${item.payload.value.toFixed(1)}%`]} /><Legend /></PieChart></ResponsiveContainer></div> : <p className="empty">Allocation appears after data is imported.</p>}</div>
      </section>

      {data.provisionalValue > 0 && <section className="card notice" style={{ marginTop: 16 }}><strong>{money(data.provisionalValue)} is provisional IBKR value</strong><p>The Trades-only Flex file establishes quantities and remaining cost basis. North Star is deliberately using cost basis until an IBKR Open Positions section or a live price provider supplies current market values.</p></section>}

      <section className="grid three" style={{ marginTop: 16 }}>
        <div className="card" style={{ gridColumn: "span 2" }}><div className="label">Largest positions</div><div className="value">Current exposure</div>{data.holdings.length ? data.holdings.slice(0, 12).map(holding => <div className="row" key={holding.id}><div><strong>{holding.symbol} <span className="mutedName">{holding.name !== holding.symbol ? holding.name : ""}</span></strong><div className="small">{holding.ownerType === "SMSF" ? "SMSF" : "Personal"} · {holding.broker} · {holding.weight.toFixed(1)}% overall {holding.valuationBasis === "cost_basis" ? "· provisional" : ""}</div><div className="bar" style={{ width: 180, marginTop: 7 }}><div className="fill" style={{ width: `${Math.min(100, holding.weight * 4)}%` }} /></div></div><div style={{ textAlign: "right" }}><strong>{money(holding.marketValueAud)}</strong><div className={holding.pnlAud >= 0 ? "positive" : "negative"}>{holding.valuationBasis === "market" ? `${holding.pnlAud >= 0 ? "+" : ""}${money(holding.pnlAud)}` : "Cost basis"}</div></div></div>) : <p className="empty">No positions saved for this view.</p>}</div>
        <div className="card"><div className="label">Accounts</div><div className="value">Data sources</div>{data.accounts.length ? data.accounts.map((account, index) => <div className="row" key={`${account.name}-${index}`}><div><span>{account.name}</span><div className="small">{account.detail}</div></div><span className="status">{account.status}</span></div>) : <p className="empty">No accounts connected yet.</p>}<div className="storageMode">Storage: {data.storageMode === "postgresql" ? "PostgreSQL" : "local application file"}</div></div>
      </section>
      {data.lastUpdated && <p className="lastUpdated">Last updated {new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.lastUpdated))}</p>}
    </>}
  </main>;
}

function ScopeButton({ value, current, onClick, children }: { value: Scope; current: Scope; onClick: (value: Scope) => void; children: React.ReactNode }) { return <button className={`tab ${current === value ? "active" : ""}`} onClick={() => onClick(value)}>{children}</button>; }
function Kpi({ label, value, cls = "", badge = false }: { label: string; value: string; cls?: string; badge?: boolean }) { return <div className="card"><div className="label">{label}</div><div className={`value ${cls}`}>{badge ? <span className={`status ${cls}`}>{value}</span> : value}</div></div>; }
