"use client";

import { FormEvent, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import type { CashAccount, OwnerType } from "@/lib/storage";
import { Card, StatusBadge } from "@/northstar/components";

const today = new Date().toISOString().slice(0, 10);
const blank = {
  ownerType: "SMSF" as OwnerType,
  institution: "Macquarie",
  name: "SMSF Cash",
  currency: "AUD",
  balance: 0,
  fxRateToAud: 1,
  asOfDate: today,
};

const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(value);

export default function CashPage() {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");

  const load = async () => setAccounts((await (await fetch("/api/cash", { cache: "no-store" })).json()).accounts ?? []);

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("Saving…");
    const response = await fetch("/api/cash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json();
    setMessage(result.error || "Cash balance saved.");
    if (!result.error) {
      await load();
      setForm(blank);
    }
  };

  return (
    <main className="shell">
      <PageHeader
        title="Cash accounts"
        description="Add Macquarie and other external cash positions without mixing Personal and SMSF ownership. IBKR cash continues to come from the automated Flex sync."
        links={[
          { href: "/", label: "← Dashboard" },
          { href: "/imports", label: "Broker imports" },
          { href: "/assets", label: "Physical platinum" },
        ]}
      />

      <section className="grid two equal">
        <Card>
          <form className="form" onSubmit={submit}>
            <p className="eyebrow">External balance</p>
            <h2 className="cardTitle">Add or update cash</h2>
            <label className="field">
              <span>Legal owner</span>
              <select value={form.ownerType} onChange={(event) => setForm({ ...form, ownerType: event.target.value as OwnerType })}>
                <option value="PERSONAL">Personal</option>
                <option value="SMSF">SMSF</option>
              </select>
            </label>
            <label className="field">
              <span>Institution</span>
              <input value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} required />
            </label>
            <label className="field">
              <span>Account name</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <div className="grid two equal compact">
              <label className="field">
                <span>Currency</span>
                <input maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} />
              </label>
              <label className="field">
                <span>Balance</span>
                <input type="number" step="0.01" value={form.balance || ""} onChange={(event) => setForm({ ...form, balance: Number(event.target.value) })} />
              </label>
            </div>
            <div className="grid two equal compact">
              <label className="field">
                <span>FX rate to AUD</span>
                <input type="number" step="0.000001" value={form.fxRateToAud} onChange={(event) => setForm({ ...form, fxRateToAud: Number(event.target.value) })} />
              </label>
              <label className="field">
                <span>Balance date</span>
                <input type="date" value={form.asOfDate} onChange={(event) => setForm({ ...form, asOfDate: event.target.value })} />
              </label>
            </div>
            <button className="primary" type="submit">Save cash balance</button>
            {message && <p className="small">{message}</p>}
          </form>
        </Card>

        <Card>
          <p className="eyebrow">Recorded balances</p>
          <h2 className="cardTitle">Current cash positions</h2>
          {accounts.length ? (
            accounts.map((account) => (
              <div className="cashRow" key={account.id}>
                <div>
                  <strong>{account.institution} · {account.name}</strong>
                  <div className="positionMeta">
                    <StatusBadge tone={account.ownerType === "SMSF" ? "warning" : "good"}>{account.ownerType === "SMSF" ? "SMSF" : "Personal"}</StatusBadge>
                    <span className="small">{account.currency}</span>
                    <span className="small">As at {account.asOfDate}</span>
                  </div>
                </div>
                <div className="rowValue">
                  <strong>{account.currency} {account.balance.toLocaleString("en-AU", { maximumFractionDigits: 2 })}</strong>
                  <div className="small">{money(account.balanceAud)}</div>
                </div>
              </div>
            ))
          ) : (
            <p className="empty">No external cash accounts have been added yet.</p>
          )}
        </Card>
      </section>
    </main>
  );
}
