"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { ManualAsset, OwnerType } from "@/lib/storage";

const today = new Date().toISOString().slice(0, 10);
const blank = {
  ownerType: "PERSONAL" as OwnerType,
  assetType: "PLATINUM" as const,
  name: "Physical platinum",
  quantityTroyOz: 0,
  totalCostAud: 0,
  currentPriceAudPerOz: 0,
  purchaseDate: today,
  asOfDate: today,
};

const money = (value: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

export default function PhysicalAssetsPage() {
  const [assets, setAssets] = useState<ManualAsset[]>([]);
  const [form, setForm] = useState(blank as typeof blank & { id?: string });
  const [message, setMessage] = useState("");

  const load = async () => {
    const result = await (await fetch("/api/assets", { cache: "no-store" })).json();
    setAssets(result.assets ?? []);
  };
  useEffect(() => { void load(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("Saving…");
    const response = await fetch("/api/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json();
    setMessage(result.error || "Physical platinum position saved.");
    if (!result.error) { await load(); setForm(blank); }
  };

  const edit = (asset: ManualAsset) => setForm({
    id: asset.id,
    ownerType: asset.ownerType,
    assetType: "PLATINUM",
    name: asset.name,
    quantityTroyOz: asset.quantityTroyOz,
    totalCostAud: asset.totalCostAud,
    currentPriceAudPerOz: asset.currentPriceAudPerOz,
    purchaseDate: asset.purchaseDate,
    asOfDate: asset.asOfDate,
  });

  const remove = async (asset: ManualAsset) => {
    if (!window.confirm(`Delete ${asset.name}?`)) return;
    const result = await (await fetch(`/api/assets?id=${asset.id}&owner=${asset.ownerType}`, { method: "DELETE" })).json();
    setMessage(result.error || "Position deleted.");
    if (!result.error) { await load(); if (form.id === asset.id) setForm(blank); }
  };

  const estimatedValue = form.quantityTroyOz * form.currentPriceAudPerOz;

  return <main className="shell">
    <div className="pageNav"><Link href="/">← Dashboard</Link><Link href="/imports">Broker imports</Link><Link href="/cash">Cash accounts</Link></div>
    <div className="brand"><h1>Physical platinum</h1><p>Add personally owned platinum positions in troy ounces. They appear in the Personal and Overall dashboards.</p></div>

    <section className="grid two equal" style={{ marginTop: 24 }}>
      <form className="card form" onSubmit={submit}>
        <div className="value">{form.id ? "Update position" : "Add platinum position"}</div>
        <label className="field"><span>Legal owner</span><select value={form.ownerType} onChange={event => setForm({ ...form, ownerType: event.target.value as OwnerType })}><option value="PERSONAL">Personal</option><option value="SMSF">SMSF</option></select></label>
        <label className="field"><span>Position name</span><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Example: ABC Bullion 1 oz bars" required /></label>
        <div className="grid two equal compact">
          <label className="field"><span>Quantity — troy oz</span><input type="number" min="0" step="0.0001" value={form.quantityTroyOz || ""} onChange={event => setForm({ ...form, quantityTroyOz: Number(event.target.value) })} required /></label>
          <label className="field"><span>Total purchase cost — AUD</span><input type="number" min="0" step="0.01" value={form.totalCostAud || ""} onChange={event => setForm({ ...form, totalCostAud: Number(event.target.value) })} required /></label>
        </div>
        <div className="grid two equal compact">
          <label className="field"><span>Purchase date</span><input type="date" value={form.purchaseDate} onChange={event => setForm({ ...form, purchaseDate: event.target.value })} required /></label>
          <label className="field"><span>Current AUD price per oz</span><input type="number" min="0" step="0.01" value={form.currentPriceAudPerOz || ""} onChange={event => setForm({ ...form, currentPriceAudPerOz: Number(event.target.value) })} required /></label>
        </div>
        <label className="field"><span>Valuation date</span><input type="date" value={form.asOfDate} onChange={event => setForm({ ...form, asOfDate: event.target.value })} required /></label>
        <div className="result"><span className="small">Estimated current value</span><div className="value">{money(estimatedValue)}</div></div>
        <div className="buttonRow"><button className="primary" type="submit">{form.id ? "Update position" : "Save position"}</button>{form.id && <button type="button" onClick={() => setForm(blank)}>Cancel</button>}</div>
        {message && <p className="small">{message}</p>}
      </form>

      <section className="card">
        <div className="value">Current platinum positions</div>
        {assets.length ? assets.map(asset => <div className="row assetRow" key={asset.id}>
          <div><strong>{asset.name}</strong><div className="small">{asset.ownerType === "SMSF" ? "SMSF" : "Personal"} · {asset.quantityTroyOz.toLocaleString("en-AU", { maximumFractionDigits: 4 })} oz · bought {asset.purchaseDate}</div><div className="small">Valued {asset.asOfDate} at {money(asset.currentPriceAudPerOz)} per oz</div></div>
          <div style={{ textAlign: "right" }}><strong>{money(asset.marketValueAud)}</strong><div className={asset.pnlAud >= 0 ? "positive" : "negative"}>{asset.pnlAud >= 0 ? "+" : ""}{money(asset.pnlAud)} · {asset.pnlPercent.toFixed(1)}%</div><div className="rowActions"><button type="button" onClick={() => edit(asset)}>Edit</button><button type="button" onClick={() => remove(asset)}>Delete</button></div></div>
        </div>) : <p className="empty">No physical platinum positions have been added.</p>}
        <div className="notice inlineNotice"><strong>Pricing</strong><p>Enter the current AUD platinum price per troy ounce for now. Automatic spot-price updates can be connected in the next stage.</p></div>
      </section>
    </section>
  </main>;
}
