"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, Notice, StatusBadge } from "@/southernstar/components";
import type { EntryOrderRisk, RiskGroupSummary, StopRiskRow, StopsRiskDashboard } from "@/lib/risk/stops";
import type { Scope, StopType } from "@/lib/storage";
import styles from "./StopsOrdersDashboard.module.css";

const stopTypes: StopType[] = ["STRUCTURAL", "TACTICAL", "TRAILING", "VOLATILITY", "MANUAL_REVIEW"];

const stopTypeLabels: Record<StopType, string> = {
  STRUCTURAL: "Structural",
  TACTICAL: "Tactical",
  TRAILING: "Trailing",
  VOLATILITY: "Volatility",
  MANUAL_REVIEW: "Manual review",
};

const exceptionLabels: Record<string, string> = {
  NO_STOP_RECORDED: "No stop",
  BROKER_ORDER_MISMATCH: "Broker mismatch",
  STOP_QUANTITY_LT_POSITION: "Under-stopped",
  STOP_QUANTITY_GT_POSITION: "Over-stopped",
  BROKER_ORDER_DATA_STALE: "Stale broker data",
  PRICE_BELOW_RECORDED_STOP: "Below stop",
  STOCK_UNDERPERFORMING_SECTOR_ETF: "Sector lag",
  UNCLASSIFIED_BROKER_ORDER: "Unclassified order",
};

type SortKey = "risk" | "symbol" | "exceptions" | "rr";

type EditForm = {
  stopType: StopType;
  plannedStopPrice: string;
  plannedTargetPrice: string;
  sectorBenchmarkSymbol: string;
  rationale: string;
  invalidationNotes: string;
  reviewStatus: string;
};

const money = (value: number | null | undefined, maximumFractionDigits = 0) =>
  value == null || !Number.isFinite(value)
    ? "-"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits }).format(value);

const number = (value: number | null | undefined, maximumFractionDigits = 2) =>
  value == null || !Number.isFinite(value)
    ? "-"
    : new Intl.NumberFormat("en-AU", { maximumFractionDigits }).format(value);

const percent = (value: number | null | undefined, maximumFractionDigits = 2) =>
  value == null || !Number.isFinite(value) ? "-" : `${number(value, maximumFractionDigits)}%`;

const nativePrice = (value: number | null | undefined, currency: string) =>
  value == null || !Number.isFinite(value) ? "-" : `${currency} ${number(value, value < 10 ? 3 : 2)}`;

function rowStatusTone(row: StopRiskRow) {
  if (row.exceptions.some((exception) => exception.severity === "critical")) return "bad" as const;
  if (row.exceptions.length) return "warning" as const;
  return "good" as const;
}

function brokerLabel(row: StopRiskRow) {
  if (row.brokerStop.status === "PROTECTED") return "Protected";
  if (row.brokerStop.status === "PLAN_ONLY") return "Plan only";
  if (row.brokerStop.status === "UNDER_STOPPED") return "Under-stopped";
  if (row.brokerStop.status === "OVER_STOPPED") return "Over-stopped";
  if (row.brokerStop.status === "STALE") return "Stale";
  if (row.brokerStop.status === "CHECK_BROKER") return "Check broker";
  return "No broker stop";
}

function brokerTone(row: StopRiskRow) {
  return row.brokerStop.status === "PROTECTED" ? "good" as const : row.brokerStop.status === "NONE" ? "bad" as const : "warning" as const;
}

function formFromRow(row: StopRiskRow): EditForm {
  return {
    stopType: row.stopType ?? "TACTICAL",
    plannedStopPrice: row.plannedStopPrice == null ? "" : String(row.plannedStopPrice),
    plannedTargetPrice: row.plannedTargetPrice == null ? "" : String(row.plannedTargetPrice),
    sectorBenchmarkSymbol: row.sectorRelativeStrength.benchmarkSymbol ?? "",
    rationale: row.rationale ?? "",
    invalidationNotes: row.invalidationNotes ?? "",
    reviewStatus: row.reviewStatus ?? "",
  };
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Price fields must be positive numbers.");
  return parsed;
}

async function loadStops(scope: Scope) {
  const response = await fetch(`/api/risk/stops?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load stops and orders.");
  return payload as StopsRiskDashboard;
}

function ScopeButton({ scope, current, children, onClick }: { scope: Scope; current: Scope; children: string; onClick: (scope: Scope) => void }) {
  return (
    <button type="button" className={current === scope ? styles.activeScope : undefined} onClick={() => onClick(scope)}>
      {children}
    </button>
  );
}

function SummaryCard({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "good" | "warning" | "bad" }) {
  return (
    <div className={`${styles.summaryCard} ${tone ? styles[tone] : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <em>{detail}</em> : null}
    </div>
  );
}

function GroupList({ title, groups }: { title: string; groups: RiskGroupSummary[] }) {
  return (
    <Card className={styles.panel}>
      <div className={styles.cardHead}>
        <p className="eyebrow">{title}</p>
        <StatusBadge tone={groups.some((group) => group.exceptions) ? "warning" : "good"}>{groups.length}</StatusBadge>
      </div>
      <div className={styles.groupList}>
        {groups.slice(0, 8).map((group) => (
          <div className={styles.groupRow} key={group.key}>
            <div>
              <strong>{group.label}</strong>
              <span>{group.positionsWithStops}/{group.positions} with stops · {group.exceptions} flags</span>
            </div>
            <div>
              <strong>{money(group.riskAud)}</strong>
              <span>{percent(group.riskPercentNav)} NAV</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EntryOrders({ orders }: { orders: EntryOrderRisk[] }) {
  return (
    <Card className={styles.panel}>
      <div className={styles.cardHead}>
        <div>
          <p className="eyebrow">Pending entry orders</p>
          <h2 className="cardTitle">Capital waiting to deploy</h2>
        </div>
        <StatusBadge tone={orders.length ? "warning" : "good"}>{orders.length}</StatusBadge>
      </div>
      {orders.length ? (
        <div className={styles.entryList}>
          {orders.map((order) => (
            <div className={styles.entryRow} key={`${order.ownerType}-${order.orderId}-${order.symbol}`}>
              <div>
                <strong>{order.symbol}</strong>
                <span>{order.ownerType} · {order.remainingQuantity.toLocaleString("en-AU")} @ {nativePrice(order.commitmentPrice, order.currency)}</span>
              </div>
              <div>
                <strong>{money(order.estimatedCapitalAud)}</strong>
                {order.estimatedCapitalAud == null ? <span>FX missing</span> : <span>{order.orderType}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : <p className={styles.empty}>No active buy orders are recorded.</p>}
    </Card>
  );
}

export default function StopsOrdersDashboard() {
  const [scope, setScope] = useState<Scope>("overall");
  const [data, setData] = useState<StopsRiskDashboard | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("risk");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError("");
      try {
        const payload = await loadStops(scope);
        if (cancelled) return;
        setData(payload);
        const selected = selectedId ? payload.rows.find((row) => row.positionId === selectedId) : payload.rows[0];
        setSelectedId(selected?.positionId ?? null);
        setForm(selected ? formFromRow(selected) : null);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load stops and orders.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [scope]);

  const selected = useMemo(
    () => data?.rows.find((row) => row.positionId === selectedId) ?? null,
    [data, selectedId],
  );

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const filtered = data?.rows.filter((row) =>
      !q || row.symbol.toUpperCase().includes(q) || row.name.toUpperCase().includes(q) || row.sector.toUpperCase().includes(q)
    ) ?? [];
    return [...filtered].sort((left, right) => {
      if (sort === "symbol") return left.symbol.localeCompare(right.symbol);
      if (sort === "exceptions") return right.exceptions.length - left.exceptions.length || (right.riskFromCurrentAud ?? 0) - (left.riskFromCurrentAud ?? 0);
      if (sort === "rr") return (right.rewardRiskRatio ?? -1) - (left.rewardRiskRatio ?? -1);
      return (right.riskFromCurrentAud ?? 0) - (left.riskFromCurrentAud ?? 0);
    });
  }, [data, query, sort]);

  function selectRow(row: StopRiskRow) {
    setSelectedId(row.positionId);
    setForm(formFromRow(row));
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    if (!selected || !form) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/positions/${selected.positionId}/risk-plan`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stopType: form.stopType,
          plannedStopPrice: parseOptionalNumber(form.plannedStopPrice),
          plannedTargetPrice: parseOptionalNumber(form.plannedTargetPrice),
          sectorBenchmarkSymbol: form.sectorBenchmarkSymbol.trim() || null,
          rationale: form.rationale.trim() || null,
          invalidationNotes: form.invalidationNotes.trim() || null,
          reviewStatus: form.reviewStatus.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Unable to save stop plan.");
      const refreshed = await loadStops(scope);
      setData(refreshed);
      const row = refreshed.rows.find((item) => item.positionId === selected.positionId) ?? refreshed.rows[0];
      setSelectedId(row?.positionId ?? null);
      setForm(row ? formFromRow(row) : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save stop plan.");
    } finally {
      setSaving(false);
    }
  }

  const summary = data?.summary;

  return (
    <main className="shell">
      <PageHeader
        title="Stops & Orders"
        description="SouthernStar’s own invalidation levels, broker stop reconciliation, pending entry capital and portfolio risk if protective stops are hit."
      />

      <div className={styles.toolbar}>
        <div className={styles.scopeTabs} aria-label="Portfolio scope">
          <ScopeButton scope="overall" current={scope} onClick={setScope}>Overall</ScopeButton>
          <ScopeButton scope="personal" current={scope} onClick={setScope}>Personal</ScopeButton>
          <ScopeButton scope="smsf" current={scope} onClick={setScope}>SMSF</ScopeButton>
        </div>
        <div className={styles.filters}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter symbol, name or sector" />
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort stops table">
            <option value="risk">Sort by risk</option>
            <option value="exceptions">Sort by exceptions</option>
            <option value="symbol">Sort by symbol</option>
            <option value="rr">Sort by reward/risk</option>
          </select>
        </div>
      </div>

      {error ? <Notice tone="error" title="Stops & Orders needs attention">{error}</Notice> : null}

      {summary ? (
        <section className={styles.summaryGrid} aria-label="Portfolio risk summary">
          <SummaryCard label="NAV" value={money(summary.navAud)} detail={`${money(summary.investedCapitalAud)} invested`} />
          <SummaryCard label="Stop risk" value={money(summary.totalStopRiskAud)} detail={`${percent(summary.totalStopRiskPercentNav)} of NAV`} tone={summary.totalStopRiskPercentNav > 8 ? "bad" : summary.totalStopRiskPercentNav > 4 ? "warning" : "good"} />
          <SummaryCard label="Stops recorded" value={`${summary.positionsWithStops}/${summary.positions}`} detail={`${summary.positionsWithoutStops} missing`} tone={summary.positionsWithoutStops ? "warning" : "good"} />
          <SummaryCard label="Largest risk" value={money(summary.largestSinglePositionRiskAud)} detail={summary.largestSinglePositionRiskSymbol ?? "No position"} />
          <SummaryCard label="Sector max" value={money(summary.largestSectorRiskAud)} detail={summary.largestSectorRiskLabel ?? "No sector"} />
          <SummaryCard label="Pending entries" value={money(summary.pendingOrderCapitalAud)} detail={summary.pendingOrderCapitalMissingFx ? `${summary.pendingOrderCapitalMissingFx} missing FX` : "Converted to AUD"} tone={summary.pendingOrderCapitalMissingFx ? "warning" : undefined} />
          <SummaryCard label="Deployable cash" value={money(summary.deployableCashAud)} detail={`${money(summary.cashAud)} total cash`} />
          <SummaryCard label="Exceptions" value={`${summary.criticalExceptions}/${summary.warningExceptions}`} detail="critical / warning" tone={summary.criticalExceptions ? "bad" : summary.warningExceptions ? "warning" : "good"} />
        </section>
      ) : null}

      <div className={styles.layout}>
        <Card className={styles.tablePanel}>
          <div className={styles.cardHead}>
            <div>
              <p className="eyebrow">Position stop register</p>
              <h2 className="cardTitle">Risk if stops are hit</h2>
            </div>
            <StatusBadge tone={rows.some((row) => row.exceptions.length) ? "warning" : "good"}>{rows.length} rows</StatusBadge>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Account</th>
                  <th className={styles.numeric}>Qty</th>
                  <th className={styles.numeric}>Entry</th>
                  <th className={styles.numeric}>Current</th>
                  <th className={styles.numeric}>Stop</th>
                  <th>Type</th>
                  <th className={styles.numeric}>Risk</th>
                  <th className={styles.numeric}>% NAV</th>
                  <th className={styles.numeric}>Target / R:R</th>
                  <th>Sector RS</th>
                  <th>Broker</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.positionId} className={selectedId === row.positionId ? styles.selectedRow : undefined} onClick={() => selectRow(row)}>
                    <td>
                      <button type="button" className={styles.assetButton} onClick={() => selectRow(row)}>
                        <strong>{row.symbol}</strong>
                        <span>{row.name}</span>
                      </button>
                      {row.exceptions.length ? (
                        <div className={styles.exceptionList}>
                          {row.exceptions.slice(0, 3).map((exception) => (
                            <span className={`${styles.exceptionPill} ${styles[exception.severity]}`} key={`${row.positionId}-${exception.code}`}>
                              {exceptionLabels[exception.code] ?? exception.code}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td><span>{row.ownerType}</span><small>{row.broker}</small></td>
                    <td className={styles.numeric}>{number(row.quantity, 0)}</td>
                    <td className={styles.numeric}>{money(row.averageCostAud, 2)}</td>
                    <td className={styles.numeric}>{nativePrice(row.currentPrice, row.currency)}</td>
                    <td className={styles.numeric}>{nativePrice(row.plannedStopPrice, row.currency)}</td>
                    <td>{row.stopType ? stopTypeLabels[row.stopType] : "-"}</td>
                    <td className={styles.numeric}>{money(row.riskFromCurrentAud)}</td>
                    <td className={styles.numeric}>{percent(row.riskPercentNav)}</td>
                    <td className={styles.numeric}>
                      <span>{nativePrice(row.plannedTargetPrice, row.currency)}</span>
                      <small>{row.rewardRiskRatio == null ? "-" : `${number(row.rewardRiskRatio, 1)}R`}</small>
                    </td>
                    <td>
                      <StatusBadge tone={row.sectorRelativeStrength.status === "UNDERPERFORMING" ? "warning" : row.sectorRelativeStrength.status === "NO_BENCHMARK" ? "warning" : "good"}>
                        {row.sectorRelativeStrength.status.replaceAll("_", " ")}
                      </StatusBadge>
                      <small>{row.sectorRelativeStrength.benchmarkSymbol ?? "No benchmark"}</small>
                    </td>
                    <td>
                      <StatusBadge tone={brokerTone(row)}>{brokerLabel(row)}</StatusBadge>
                      <small>{row.brokerStop.brokerStopPrice == null ? "" : `${row.currency} ${number(row.brokerStop.brokerStopPrice)}`}</small>
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={12}><p className={styles.empty}>No matching positions.</p></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <aside className={styles.sideRail}>
          <Card className={styles.panel}>
            <div className={styles.cardHead}>
              <div>
                <p className="eyebrow">Selected plan</p>
                <h2 className="cardTitle">{selected ? `${selected.symbol} stop plan` : "No position selected"}</h2>
              </div>
              {selected ? <StatusBadge tone={rowStatusTone(selected)}>{selected.exceptions.length ? `${selected.exceptions.length} flags` : "Clean"}</StatusBadge> : null}
            </div>
            {selected && form ? (
              <form className={styles.editor} onSubmit={savePlan}>
                <div className={styles.editorGrid}>
                  <label>
                    <span>Stop type</span>
                    <select value={form.stopType} onChange={(event) => setForm({ ...form, stopType: event.target.value as StopType })}>
                      {stopTypes.map((type) => <option key={type} value={type}>{stopTypeLabels[type]}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Stop price ({selected.currency})</span>
                    <input type="number" step="0.0001" min="0" value={form.plannedStopPrice} onChange={(event) => setForm({ ...form, plannedStopPrice: event.target.value })} />
                  </label>
                  <label>
                    <span>Target ({selected.currency})</span>
                    <input type="number" step="0.0001" min="0" value={form.plannedTargetPrice} onChange={(event) => setForm({ ...form, plannedTargetPrice: event.target.value })} />
                  </label>
                  <label>
                    <span>Benchmark</span>
                    <input value={form.sectorBenchmarkSymbol} onChange={(event) => setForm({ ...form, sectorBenchmarkSymbol: event.target.value.toUpperCase() })} placeholder="XOP" />
                  </label>
                </div>
                <label>
                  <span>Rationale</span>
                  <textarea value={form.rationale} onChange={(event) => setForm({ ...form, rationale: event.target.value })} rows={4} />
                </label>
                <label>
                  <span>Invalidation notes</span>
                  <textarea value={form.invalidationNotes} onChange={(event) => setForm({ ...form, invalidationNotes: event.target.value })} rows={4} />
                </label>
                <label>
                  <span>Review status</span>
                  <input value={form.reviewStatus} onChange={(event) => setForm({ ...form, reviewStatus: event.target.value })} placeholder="Review weekly" />
                </label>
                <div className={styles.saveBar}>
                  <button className="primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save plan"}</button>
                  <span>SouthernStar records intent only. Broker orders remain read-only.</span>
                </div>
              </form>
            ) : <p className={styles.empty}>Select a position to edit its stop plan.</p>}
          </Card>

          <EntryOrders orders={data?.entryOrders ?? []} />
        </aside>
      </div>

      <div className={styles.lowerGrid}>
        <GroupList title="Sector risk" groups={data?.sectors ?? []} />
        <GroupList title="Account risk" groups={data?.accounts ?? []} />
      </div>
    </main>
  );
}
