"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import type { Scope } from "@/lib/storage";
import type { TaxLotsResponse } from "@/lib/tax-lots";
import { Card, Notice, StatusBadge, SummaryGrid } from "@/southernstar/components";

const scopes: Array<{ key: Scope; label: string }> = [
  { key: "overall", label: "Overall" },
  { key: "personal", label: "Personal" },
  { key: "smsf", label: "SMSF" },
];

const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

const signedMoney = (value: number) => `${value >= 0 ? "+" : ""}${money(value)}`;

const number = (value: number) =>
  new Intl.NumberFormat("en-AU", { maximumFractionDigits: 4 }).format(value);

const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;

function dateLabel(value: string | null) {
  if (!value) return "Unknown";
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function heldLabel(days: number | null) {
  if (days == null) return "Unknown";
  if (days < 365) return `${days}d`;
  return `${Math.floor(days / 365)}y ${days % 365}d`;
}

function tone(value: number) {
  return value >= 0 ? "positive" : "negative";
}

async function loadTaxLots(scope: Scope): Promise<TaxLotsResponse> {
  const response = await fetch(`/api/tax-lots?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load tax lots");
  return payload as TaxLotsResponse;
}

type TaxProfile = { ownerType: "PERSONAL" | "SMSF"; pensionPhase: boolean };

export default function TaxLotsPage() {
  const [scope, setScope] = useState<Scope>("overall");
  const [profiles, setProfiles] = useState<TaxProfile[]>([]);
  const [profileBusy, setProfileBusy] = useState(false);
  const [data, setData] = useState<TaxLotsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await loadTaxLots(scope);
        if (!cancelled) setData(result);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load tax lots");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    void fetch("/api/tax-profiles", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => { if (!cancelled && Array.isArray(payload.profiles)) setProfiles(payload.profiles); })
      .catch(() => { /* the phase toggle is a refinement; the lots still render without it */ });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const topOpenLots = useMemo(() => data?.openLots.slice(0, 80) ?? [], [data]);
  const topRealisedLots = useMemo(() => data?.realisedLots.slice(0, 80) ?? [], [data]);
  const scopeLabel = scopes.find((item) => item.key === scope)?.label ?? "Overall";

  const ownerForScope = (value: Scope) => value === "smsf" ? "SMSF" as const : "PERSONAL" as const;
  const pensionPhaseFor = (value: Scope) =>
    profiles.find((profile) => profile.ownerType === ownerForScope(value))?.pensionPhase ?? false;

  /** Changing the phase changes every taxable figure on the page, so the lots are rebuilt after it. */
  async function updatePensionPhase(value: Scope, pensionPhase: boolean) {
    setProfileBusy(true);
    try {
      const response = await fetch("/api/tax-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerType: ownerForScope(value), pensionPhase }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Unable to update tax profile");
      setProfiles((current) => [
        ...current.filter((profile) => profile.ownerType !== payload.profile.ownerType),
        payload.profile,
      ]);
      setData(await loadTaxLots(value));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update tax profile");
    } finally {
      setProfileBusy(false);
    }
  }

  return (
    <main className="shell">
      <PageHeader
        title="Tax lots"
        description="FIFO CGT view for current holdings and realised sales, including discount eligibility by legal owner."
        links={[
          { href: "/", label: "Dashboard" },
          { href: "/holdings", label: "Holdings" },
          { href: "/reports", label: "Reports" },
          { href: "/sync", label: "Sync" },
        ]}
      />

      <Card className="taxHeroCard">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">CGT workbench</p>
            <h2 className="cardTitle">{scopeLabel} tax position</h2>
            <p className="cardIntro">FIFO lots are reconstructed from imported BUY and SELL trades. Fallback lots use current position cost basis when acquisition history is incomplete.</p>
          </div>
          {data ? <StatusBadge tone={data.summary.fallbackLots ? "warning" : "good"}>{data.summary.fallbackLots ? `${data.summary.fallbackLots} fallback lots` : "Lot history matched"}</StatusBadge> : null}
        </div>

        <div className="taxToolbar">
          <div className="scopeSwitch" role="tablist" aria-label="Tax lot scope">
            {scopes.map((item) => (
              <button key={item.key} type="button" className={scope === item.key ? "isActive" : ""} onClick={() => setScope(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
          {scope === "overall" ? null : (
            <label className="taxPhaseToggle">
              <input
                type="checkbox"
                checked={pensionPhaseFor(scope)}
                disabled={profileBusy}
                onChange={(event) => void updatePensionPhase(scope, event.target.checked)}
              />
              <span>Pension phase<em>{pensionPhaseFor(scope) ? "Gains exempt" : "Gains taxable"}</em></span>
            </label>
          )}
          <a className="button" href={`/api/reports/tax-position?scope=${scope}`}>Download tax CSV</a>
        </div>
      </Card>

      {loading ? (
        <Card><p className="empty">Loading tax lots...</p></Card>
      ) : error ? (
        <Notice tone="error" title="Unable to load tax lots">{error}</Notice>
      ) : data ? (
        <>
          <section className="taxSummaryGrid">
            <Card>
              <p className="eyebrow">Open CGT position</p>
              <SummaryGrid
                entries={[
                  ["Open lots", data.summary.openLots],
                  ["Cost base", money(data.summary.openCostAud)],
                  ["Market value", money(data.summary.openMarketValueAud)],
                  ["Unrealised gain", signedMoney(data.summary.unrealisedGainAud)],
                  ["Eligible gains", money(data.summary.unrealisedDiscountEligibleGainAud)],
                  ["Taxable if sold", signedMoney(data.summary.taxableGainIfSoldAud)],
                ]}
              />
            </Card>
            <Card>
              <p className="eyebrow">Realised sales</p>
              <SummaryGrid
                entries={[
                  ["Realised lots", data.summary.realisedLots],
                  ["Gross gains", money(data.summary.realisedGainAud)],
                  ["Gross losses", money(data.summary.realisedLossAud)],
                  ["Net realised", signedMoney(data.summary.netRealisedAud)],
                  ["Taxable realised", signedMoney(data.summary.taxableRealisedAud)],
                  ["As of", dateLabel(data.asOfDate)],
                ]}
              />
            </Card>
          </section>

          <Card className="taxTableCard">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Open lots</p>
                <h2 className="cardTitle">Unrealised CGT by acquisition lot</h2>
              </div>
              <span className="panelCount">{topOpenLots.length} shown</span>
            </div>
            <div className="taxTableWrap">
              <table className="taxTable">
                <thead>
                  <tr>
                    <th>Holding</th>
                    <th>Owner</th>
                    <th>Acquired</th>
                    <th>Held</th>
                    <th className="numeric">Units</th>
                    <th className="numeric">Cost</th>
                    <th className="numeric">Value</th>
                    <th className="numeric">Unrealised</th>
                    <th>Discount</th>
                    <th className="numeric">Taxable if sold</th>
                  </tr>
                </thead>
                <tbody>
                  {topOpenLots.map((lot) => (
                    <tr key={lot.id}>
                      <td>
                        <strong>{lot.symbol}</strong>
                        <span>{lot.name}</span>
                        <small>{lot.broker} · {lot.exchange} · {lot.source === "position_fallback" ? "fallback cost basis" : "FIFO transaction lot"}</small>
                      </td>
                      <td>{lot.ownerLabel}</td>
                      <td>{dateLabel(lot.acquisitionDate)}</td>
                      <td>{heldLabel(lot.heldDays)}</td>
                      <td className="numeric">{number(lot.quantity)}</td>
                      <td className="numeric">{money(lot.costAud)}</td>
                      <td className="numeric">{money(lot.marketValueAud)}</td>
                      <td className={`numeric ${tone(lot.unrealisedGainAud)}`}>
                        {signedMoney(lot.unrealisedGainAud)}
                        <span>{percent(lot.unrealisedGainPercent)}</span>
                      </td>
                      <td>
                        <span className={lot.discountEligible ? "taxDiscount isEligible" : "taxDiscount"}>{lot.discountEligible ? `${Math.round(lot.discountRate * 100)}% eligible` : "Not eligible"}</span>
                      </td>
                      <td className={`numeric ${tone(lot.taxableGainIfSoldAud)}`}>{signedMoney(lot.taxableGainIfSoldAud)}</td>
                    </tr>
                  ))}
                  {!topOpenLots.length ? <tr><td colSpan={10} className="emptyCell">No open tax lots in this scope.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="taxTableCard">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Realised lots</p>
                <h2 className="cardTitle">Matched sales and taxable gains</h2>
              </div>
              <span className="panelCount">{topRealisedLots.length} shown</span>
            </div>
            <div className="taxTableWrap">
              <table className="taxTable realisedTaxTable">
                <thead>
                  <tr>
                    <th>Sale</th>
                    <th>Owner</th>
                    <th>Acquired</th>
                    <th>Sold</th>
                    <th className="numeric">Units</th>
                    <th className="numeric">Proceeds</th>
                    <th className="numeric">Cost</th>
                    <th className="numeric">Realised</th>
                    <th>Discount</th>
                    <th className="numeric">Taxable</th>
                  </tr>
                </thead>
                <tbody>
                  {topRealisedLots.map((lot) => (
                    <tr key={lot.id}>
                      <td>
                        <strong>{lot.symbol}</strong>
                        <span>{lot.name}</span>
                        <small>{lot.note}</small>
                      </td>
                      <td>{lot.ownerLabel}</td>
                      <td>{dateLabel(lot.acquisitionDate)}</td>
                      <td>{dateLabel(lot.saleDate)}</td>
                      <td className="numeric">{number(lot.quantity)}</td>
                      <td className="numeric">{money(lot.proceedsAud)}</td>
                      <td className="numeric">{money(lot.costAud)}</td>
                      <td className={`numeric ${tone(lot.realisedGainAud)}`}>{signedMoney(lot.realisedGainAud)}</td>
                      <td>
                        <span className={lot.discountEligible ? "taxDiscount isEligible" : "taxDiscount"}>{lot.discountEligible ? `${Math.round(lot.discountRate * 100)}% eligible` : "Not eligible"}</span>
                      </td>
                      <td className={`numeric ${tone(lot.taxableGainAud)}`}>{signedMoney(lot.taxableGainAud)}</td>
                    </tr>
                  ))}
                  {!topRealisedLots.length ? <tr><td colSpan={10} className="emptyCell">No realised sale lots in this scope.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </main>
  );
}
