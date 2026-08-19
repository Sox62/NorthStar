"use client";

import { FormEvent, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import type { ManualAsset, OwnerType, PlatinumPrice } from "@/lib/storage";
import { Card, Notice, StatusBadge, SummaryGrid } from "@/northstar/components";

const today = new Date().toISOString().slice(0, 10);
type PhysicalMetalType = "GOLD" | "SILVER" | "PLATINUM" | "PALLADIUM";
type PhysicalAssetForm = {
  id?: string;
  ownerType: OwnerType;
  assetType: PhysicalMetalType;
  name: string;
  quantityKg: number;
  totalCostAud: number;
  purchaseDate: string;
  manualBuybackAudPerKg: string;
  manualRetailAudPerKg: string;
};

const metalOptions: Array<{ value: PhysicalMetalType; label: string; defaultName: string; placeholder: string; enabled: boolean }> = [
  { value: "GOLD", label: "Gold", defaultName: "Physical gold", placeholder: "Example: ABC Bullion gold bars", enabled: true },
  { value: "SILVER", label: "Silver", defaultName: "Physical silver", placeholder: "Example: ABC Bullion silver bars", enabled: true },
  { value: "PLATINUM", label: "Platinum", defaultName: "Physical platinum", placeholder: "Example: ABC Bullion platinum bars", enabled: true },
  { value: "PALLADIUM", label: "Palladium", defaultName: "Physical palladium", placeholder: "Example: ABC Bullion palladium bars", enabled: true },
];

const blank: PhysicalAssetForm = {
  ownerType: "PERSONAL",
  assetType: "PLATINUM",
  name: "Physical platinum",
  quantityKg: 0,
  totalCostAud: 0,
  purchaseDate: today,
  manualBuybackAudPerKg: "",
  manualRetailAudPerKg: "",
};

const money = (value: number, digits = 0) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const number = (value: number, digits = 4) => value.toLocaleString("en-AU", { maximumFractionDigits: digits });

const safeIsoDateTime = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

export default function PhysicalAssetsPage() {
  const [assets, setAssets] = useState<ManualAsset[]>([]);
  const [price, setPrice] = useState<PlatinumPrice | null>(null);
  const [form, setForm] = useState<PhysicalAssetForm>(blank);
  const [message, setMessage] = useState("");
  const [priceMessage, setPriceMessage] = useState("Loading ABC Bullion buyback price…");
  const [refreshing, setRefreshing] = useState(false);
  const [manualPrice, setManualPrice] = useState({ buybackAudPerKg: "", retailAudPerKg: "", priceDate: today });

  const loadAssets = async () => {
    const result = await (await fetch("/api/assets", { cache: "no-store" })).json();
    setAssets(result.assets ?? []);
  };

  const loadPrice = async (refresh: boolean) => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/prices/platinum${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const result = await response.json();
      setPrice(result.price ?? null);
      if (result.error) setPriceMessage(`${result.error}${result.usingSavedPrice ? " Using the last saved price." : ""}`);
      else setPriceMessage("ABC Bullion price refreshed.");
      if (refresh && result.price) await loadAssets();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAssets();
    void loadPrice(true);
  }, []);

  const submitManualPrice = async (event: FormEvent) => {
    event.preventDefault();
    setPriceMessage("Saving manual ABC Bullion price...");
    const response = await fetch("/api/prices/platinum", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        buybackAudPerKg: manualPrice.buybackAudPerKg,
        retailAudPerKg: manualPrice.retailAudPerKg || undefined,
        priceDate: manualPrice.priceDate,
      }),
    });
    const result = await response.json();
    if (result.error) {
      setPriceMessage(result.error);
      return;
    }
    setPrice(result.price ?? null);
    setPriceMessage("Manual ABC Bullion price saved and platinum positions revalued.");
    await loadAssets();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selectedMetal = metalOptions.find((option) => option.value === form.assetType) ?? metalOptions[2];
    const isPlatinum = form.assetType === "PLATINUM";
    const buybackAudPerKg = isPlatinum ? price?.buybackAudPerKg : Number(form.manualBuybackAudPerKg);
    const retailAudPerKg = isPlatinum ? price?.retailAudPerKg : Number(form.manualRetailAudPerKg || form.manualBuybackAudPerKg);
    if (!buybackAudPerKg || !retailAudPerKg || buybackAudPerKg <= 0 || retailAudPerKg <= 0) {
      setMessage(isPlatinum ? "Refresh the ABC Bullion price before saving this position." : "Enter a manual AUD/kg valuation before saving this metal.");
      return;
    }
    setMessage("Saving...");
    const response = await fetch("/api/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        assetType: form.assetType,
        buybackAudPerKg,
        retailAudPerKg,
        priceProvider: isPlatinum && price ? price.provider : "Manual",
        priceSourceUrl: isPlatinum && price ? price.sourceUrl : "https://northstar.local/manual-physical-metals",
        priceRetrievedAt: isPlatinum && price ? safeIsoDateTime(price.retrievedAt) : new Date().toISOString(),
        asOfDate: isPlatinum && price ? price.priceDate : today,
      }),
    });
    const result = await response.json();
    setMessage(result.error || selectedMetal.label + " position saved.");
    if (!result.error) {
      await loadAssets();
      setForm(blank);
    }
  };

  const edit = (asset: ManualAsset) =>
    setForm({
      id: asset.id,
      ownerType: asset.ownerType,
      assetType: asset.assetType,
      name: asset.name,
      quantityKg: asset.quantityKg,
      totalCostAud: asset.totalCostAud,
      purchaseDate: asset.purchaseDate,
      manualBuybackAudPerKg: asset.assetType === "PLATINUM" ? "" : String(asset.buybackAudPerKg),
      manualRetailAudPerKg: asset.assetType === "PLATINUM" ? "" : String(asset.retailAudPerKg),
    });

  const remove = async (asset: ManualAsset) => {
    if (!window.confirm(`Delete ${asset.name}?`)) return;
    const result = await (await fetch(`/api/assets?id=${asset.id}&owner=${asset.ownerType}`, { method: "DELETE" })).json();
    setMessage(result.error || "Position deleted.");
    if (!result.error) {
      await loadAssets();
      if (form.id === asset.id) setForm(blank);
    }
  };

  const selectedMetal = metalOptions.find((option) => option.value === form.assetType) ?? metalOptions[2];
  const canSaveSelectedMetal = selectedMetal.enabled;
  const manualBuybackAudPerKg = Number(form.manualBuybackAudPerKg);
  const valuationAudPerKg = form.assetType === "PLATINUM" ? price?.buybackAudPerKg ?? 0 : Number.isFinite(manualBuybackAudPerKg) ? manualBuybackAudPerKg : 0;
  const estimatedValue = form.quantityKg * valuationAudPerKg;
  const estimatedReturn = form.totalCostAud && estimatedValue ? ((estimatedValue - form.totalCostAud) / form.totalCostAud) * 100 : 0;

  return (
    <main className="shell">
      <PageHeader
        title="Physical metals"
        description="Record physical bullion positions. Platinum can use the ABC Bullion buyback feed; gold, silver and palladium can be entered with a manual AUD/kg valuation until dealer feeds are wired."
        links={[
          { href: "/", label: "← Dashboard" },
          { href: "/sync", label: "Sync" },
          { href: "/cash", label: "Cash accounts" },
          { href: "/roadmap", label: "Roadmap" },
        ]}
      />

      <Card className="priceCard">
        <div>
          <p className="eyebrow">Automated valuation source</p>
          <h2 className="cardTitle">Platinum · ABC Bullion 1 kg tablet</h2>
          {price ? (
            <SummaryGrid
              entries={[
                ["Buyback per kg", `${money(price.buybackAudPerKg, 2)}`],
                ["Retail per kg", `${money(price.retailAudPerKg, 2)}`],
                ["Dealer spread", `${money(price.spreadAudPerKg, 2)} · ${price.spreadPercentOfRetail.toFixed(2)}%`],
                ["Price date", price.priceDate],
              ]}
            />
          ) : (
            <p className="small">No saved platinum price is available yet.</p>
          )}
          <p className="small">{priceMessage}</p>
        </div>
        <div className="priceActions">
          <button type="button" onClick={() => void loadPrice(true)} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh ABC price"}
          </button>
          <form className="manualPriceForm" onSubmit={submitManualPrice}>
            <p className="eyebrow">Manual fallback</p>
            <label className="field">
              <span>ABC buyback per kg</span>
              <input type="number" min="0" step="0.01" value={manualPrice.buybackAudPerKg} onChange={(event) => setManualPrice({ ...manualPrice, buybackAudPerKg: event.target.value })} placeholder="67036.60" required />
            </label>
            <label className="field">
              <span>Retail per kg optional</span>
              <input type="number" min="0" step="0.01" value={manualPrice.retailAudPerKg} onChange={(event) => setManualPrice({ ...manualPrice, retailAudPerKg: event.target.value })} placeholder={price ? String(price.retailAudPerKg) : ""} />
            </label>
            <label className="field">
              <span>Price date</span>
              <input type="date" value={manualPrice.priceDate} onChange={(event) => setManualPrice({ ...manualPrice, priceDate: event.target.value })} required />
            </label>
            <button className="primary" type="submit">Save manual ABC price</button>
          </form>
        </div>
      </Card>

      <section className="grid two equal sectionStack">
        <Card>
          <form className="form" onSubmit={submit}>
            <p className="eyebrow">{form.id ? "Edit asset" : "New asset"}</p>
            <h2 className="cardTitle">{form.id ? "Update position" : "Add physical metal position"}</h2>
            <label className="field">
              <span>Legal owner</span>
              <select value={form.ownerType} onChange={(event) => setForm({ ...form, ownerType: event.target.value as OwnerType })}>
                <option value="PERSONAL">Personal</option>
                <option value="SMSF">SMSF</option>
              </select>
            </label>
            <label className="field">
              <span>Metal</span>
              <select
                value={form.assetType}
                onChange={(event) => {
                  const assetType = event.target.value as PhysicalMetalType;
                  const metal = metalOptions.find((option) => option.value === assetType) ?? selectedMetal;
                  setForm({ ...form, assetType, name: form.name === selectedMetal.defaultName ? metal.defaultName : form.name });
                }}
              >
                {metalOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {form.assetType !== "PLATINUM" && (
              <Notice tone="neutral" title={selectedMetal.label + " manual valuation"}>
                Enter the current AUD/kg value for this metal. SouthernStar will store it separately from the ABC platinum feed.
              </Notice>
            )}
            <label className="field">
              <span>Position name</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={selectedMetal.placeholder} required />
            </label>
            <div className="grid two equal compact">
              <label className="field">
                <span>Quantity — kilograms</span>
                <input type="number" min="0" step="0.0001" value={form.quantityKg || ""} onChange={(event) => setForm({ ...form, quantityKg: Number(event.target.value) })} required />
              </label>
              <label className="field">
                <span>Total purchase cost — AUD</span>
                <input type="number" min="0" step="0.01" value={form.totalCostAud || ""} onChange={(event) => setForm({ ...form, totalCostAud: Number(event.target.value) })} required />
              </label>
            </div>
            {form.assetType !== "PLATINUM" && (
              <div className="grid two equal compact">
                <label className="field">
                  <span>Current value — AUD/kg</span>
                  <input type="number" min="0" step="0.01" value={form.manualBuybackAudPerKg} onChange={(event) => setForm({ ...form, manualBuybackAudPerKg: event.target.value })} required />
                </label>
                <label className="field">
                  <span>Retail value — AUD/kg optional</span>
                  <input type="number" min="0" step="0.01" value={form.manualRetailAudPerKg} onChange={(event) => setForm({ ...form, manualRetailAudPerKg: event.target.value })} />
                </label>
              </div>
            )}
            <label className="field">
              <span>Purchase date</span>
              <input type="date" value={form.purchaseDate} onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })} required />
            </label>
            <div className="result">
              <span className="small">Estimated current buyback value</span>
              <div className="value">{valuationAudPerKg > 0 ? money(estimatedValue) : "Pending"}</div>
              {form.totalCostAud > 0 && canSaveSelectedMetal && (
                <div className={estimatedReturn >= 0 ? "positive" : "negative"}>
                  {estimatedReturn >= 0 ? "+" : ""}{estimatedReturn.toFixed(2)}% against your purchase cost
                </div>
              )}
            </div>
            <div className="buttonRow">
              <button className="primary" type="submit" disabled={form.assetType === "PLATINUM" && !price}>{form.id ? "Update position" : "Save position"}</button>
              {form.id && <button type="button" onClick={() => setForm(blank)}>Cancel</button>}
            </div>
            {message && <p className="small">{message}</p>}
          </form>
        </Card>

        <Card>
          <p className="eyebrow">Physical bullion</p>
          <h2 className="cardTitle">Current physical metal positions</h2>
          {assets.length ? (
            assets.map((asset) => (
              <div className="assetRow" key={asset.id}>
                <div>
                  <strong>{asset.name}</strong>
                  <div className="positionMeta">
                    <StatusBadge tone={asset.ownerType === "SMSF" ? "warning" : "good"}>{asset.ownerType === "SMSF" ? "SMSF" : "Personal"}</StatusBadge>
                    <span className="small">{asset.assetType.toLowerCase()} · {number(asset.quantityKg)} kg</span>
                    <span className="small">Bought {asset.purchaseDate}</span>
                  </div>
                  <div className="small">Cost {money(asset.costAudPerKg, 2)} / kg · buyback {money(asset.buybackAudPerKg, 2)} / kg</div>
                  <div className="small">{asset.priceProvider} retail-to-buyback spread: {asset.dealerSpreadPercent.toFixed(2)}%</div>
                </div>
                <div className="rowValue">
                  <strong>{money(asset.marketValueAud)}</strong>
                  <div className={asset.pnlAud >= 0 ? "positive" : "negative"}>
                    {asset.pnlAud >= 0 ? "+" : ""}{money(asset.pnlAud)} · {asset.pnlPercent.toFixed(2)}%
                  </div>
                  <div className="rowActions">
                    <button type="button" onClick={() => edit(asset)}>Edit</button>
                    <button type="button" onClick={() => remove(asset)}>Delete</button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="empty">No physical metal positions have been added.</p>
          )}
          <Notice tone="neutral" title="Performance versus dealer spread">
            Your investment return is calculated against what you actually paid. The retail-to-buyback spread is displayed separately and is not treated as your investment loss.
          </Notice>
        </Card>
      </section>
    </main>
  );
}
