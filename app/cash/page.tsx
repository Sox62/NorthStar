"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { CashAccount, OwnerType } from "@/lib/storage";

const today = new Date().toISOString().slice(0, 10);
const blank = { ownerType: "SMSF" as OwnerType, institution: "Macquarie", name: "SMSF Cash", currency: "AUD", balance: 0, fxRateToAud: 1, asOfDate: today };

export default function CashPage() {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");
  const load = async () => setAccounts((await (await fetch("/api/cash")).json()).accounts ?? []);
  useEffect(() => { void load(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage("Saving…");
    const response = await fetch("/api/cash", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json();
    setMessage(result.error || "Cash balance saved.");
    if (!result.error) { await load(); setForm(blank); }
  };

  return <main className="shell">
    <div className="pageNav"><Link href="/">← Dashboard</Link><Link href="/imports">Broker imports</Link></div>
    <div className="brand"><h1>Cash accounts</h1><p>Add Macquarie and other cash positions without mixing Personal and SMSF ownership.</p></div>
    <section className="grid two equal" style={{ marginTop: 24 }}>
      <form className="card form" onSubmit={submit}>
        <div className="value">Add or update cash</div>
        <label className="field"><span>Legal owner</span><select value={form.ownerType} onChange={event => setForm({ ...form, ownerType: event.target.value as OwnerType })}><option value="PERSONAL">Personal</option><option value="SMSF">SMSF</option></select></label>
        <label className="field"><span>Institution</span><input value={form.institution} onChange={event => setForm({ ...form, institution: event.target.value })} required /></label>
        <label className="field"><span>Account name</span><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
        <div className="grid two equal compact"><label className="field"><span>Currency</span><input maxLength={3} value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></label><label className="field"><span>Balance</span><input type="number" step="0.01" value={form.balance} onChange={event => setForm({ ...form, balance: Number(event.target.value) })} /></label></div>
        <div className="grid two equal compact"><label className="field"><span>FX rate to AUD</span><input type="number" step="0.000001" value={form.fxRateToAud} onChange={event => setForm({ ...form, fxRateToAud: Number(event.target.value) })} /></label><label className="field"><span>Balance date</span><input type="date" value={form.asOfDate} onChange={event => setForm({ ...form, asOfDate: event.target.value })} /></label></div>
        <button className="primary" type="submit">Save cash balance</button>{message && <p className="small">{message}</p>}
      </form>
      <section className="card"><div className="value">Current cash positions</div>{accounts.length ? accounts.map(account => <div className="row" key={account.id}><div><strong>{account.institution} · {account.name}</strong><div className="small">{account.ownerType === "SMSF" ? "SMSF" : "Personal"} · {account.currency} · {account.asOfDate}</div></div><div style={{ textAlign: "right" }}><strong>{account.currency} {account.balance.toLocaleString("en-AU", { maximumFractionDigits: 2 })}</strong><div className="small">A${account.balanceAud.toLocaleString("en-AU", { maximumFractionDigits: 2 })}</div></div></div>) : <p className="empty">No external cash accounts have been added yet.</p>}</section>
    </section>
  </main>;
}
