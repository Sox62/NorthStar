"use client";
import React from "react";
import { NavRail } from "./NavRail";
import { SplitBar } from "./SplitBar";
import { byScope, totals, bySector, byComposition, fmtAud } from "../lib/portfolio-metrics";
import { SECTOR_COLORS, COMPOSITION_OF, type Holding, type CompositionGroup, type Sector } from "../types";

const glass: React.CSSProperties = { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 18, backdropFilter: "blur(8px)" };
const eyebrow: React.CSSProperties = { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--muted)", fontWeight: 600 };
const serif = "var(--ns-serif)";
const GROUP_LABEL: Record<CompositionGroup, string> = { miners: "Miners", metals: "Metals & bullion", other: "Oil & cash" };
const GROUP_COLOR: Record<CompositionGroup, string> = { miners: "#d7b56d", metals: "#8fa6bf", other: "#5d6f81" };

/** Dedicated Sectors screen — composition split up top, then per-sector cards
 *  grouped miners / metals / other, each listing its holdings. Data-driven. */
export function SectorsScreen({ holdings, logoSrc }: { holdings: Holding[]; logoSrc?: string }) {
  const all = byScope(holdings, "overall");
  const grand = totals(all).marketValue;
  const safeGrand = grand || 1;
  const comp = byComposition(all);
  const sectors = bySector(all);
  const smax = sectors[0]?.value || 1;

  const groups: CompositionGroup[] = ["miners", "metals", "other"];
  const sectorsIn = (g: CompositionGroup) => sectors.filter((s) => COMPOSITION_OF[s.sector] === g);
  const holdingsIn = (sec: Sector) => all.filter((h) => h.sector === sec).sort((a, b) => b.marketValueAud - a.marketValueAud);

  return (
    <div className="nsScreen">
      <NavRail active="sectors" logoSrc={logoSrc} />
      <main className="nsScreenMain">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: serif, fontSize: 30, fontWeight: 400, margin: 0 }}>Sectors</h1>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5 }}>How the {fmtAud(grand)} portfolio splits across metals, miners and cash</div>
        </div>

        <section style={{ ...glass, padding: 22, marginBottom: 22 }}>
          <div style={eyebrow}>Metals &amp; bullion vs miners</div>
          <div style={{ marginTop: 16 }}>
            <SplitBar segments={groups.map((g) => ({ label: GROUP_LABEL[g], value: comp[g], display: fmtAud(comp[g]), pct: +(comp[g] / safeGrand * 100).toFixed(1), color: GROUP_COLOR[g] }))} />
          </div>
        </section>

        {groups.map((g) => {
          const gsecs = sectorsIn(g);
          if (!gsecs.length) return null;
          return (
            <div key={g}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "30px 0 14px" }}>
                <div style={{ fontFamily: serif, fontSize: 20 }}>{GROUP_LABEL[g]}</div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>{fmtAud(comp[g])} · {(comp[g] / safeGrand * 100).toFixed(1)}% of NAV</div>
              </div>
              <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 20 }}>
                {gsecs.map((s) => {
                  const rows = holdingsIn(s.sector);
                  return (
                    <div key={s.sector} style={{ ...glass, padding: 22 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: serif, fontSize: 17 }}>
                          <span style={{ width: 11, height: 11, borderRadius: 4, background: SECTOR_COLORS[s.sector] }} />{s.sector}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{(s.value / safeGrand * 100).toFixed(1)}%</div>
                      </div>
                      <div style={{ fontFamily: serif, fontSize: 24, marginTop: 12, fontVariantNumeric: "tabular-nums" }}>{fmtAud(s.value)}</div>
                      <div style={{ height: 7, borderRadius: 999, background: "rgba(122,149,178,0.14)", overflow: "hidden", margin: "14px 0 4px" }}>
                        <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${(s.value / smax) * 100}%`, background: SECTOR_COLORS[s.sector] }} />
                      </div>
                      <div style={{ marginTop: 12, borderTop: "1px solid var(--line)" }}>
                        {rows.map((h) => (
                          <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
                            <div><div style={{ fontWeight: 600 }}>{h.symbol}<span style={{ fontWeight: 400, fontSize: 10, marginLeft: 6, color: "var(--muted-dim)" }}>{h.ownerType === "SMSF" ? "SMSF" : "Personal"}</span></div><div style={{ fontSize: 11.5, color: "var(--muted-dim)" }}>{h.name}</div></div>
                            <div style={{ textAlign: "right", fontFamily: serif }}>{fmtAud(h.marketValueAud)}<div style={{ fontFamily: "var(--ns-sans)", fontSize: 11.5, marginTop: 2, color: h.pnlPercent >= 0 ? "var(--pos)" : "var(--neg)" }}>{h.pnlPercent >= 0 ? "+" : ""}{h.pnlPercent.toFixed(1)}%</div></div>
                          </div>
                        ))}
                        {rows.length === 0 && <div style={{ padding: "9px 0", fontSize: 13, color: "var(--muted)" }}>Single holding</div>}
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>
          );
        })}
      </main>
    </div>
  );
}
