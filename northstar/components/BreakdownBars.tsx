import React from "react";

export interface BreakdownItem {
  label: string;
  value: number;
  color?: string;
  
  display?: string;
}

export interface BreakdownBarsProps {
  
  items: BreakdownItem[];
}

export function BreakdownBars({ items = [] }: BreakdownBarsProps) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 12, alignItems: "center", padding: "8px 0", fontSize: "13px" }}>
          <span style={{ color: "var(--text-muted)" }}>{it.label}</span>
          <div style={{ height: 9, borderRadius: 999, background: "rgba(122,149,178,0.12)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${(it.value / max) * 100}%`, background: it.color || "var(--accent)" }} />
          </div>
          <span style={{ fontFamily: "var(--font-serif-motto)", fontSize: "13.5px" }}>{it.display ?? it.value}</span>
        </div>
      ))}
    </div>
  );
}
