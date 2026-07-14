import React from "react";

export interface SummaryGridProps {
  
  entries: Array<[string, React.ReactNode]>;
}

export function SummaryGrid({ entries = [] }: SummaryGridProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "9px", marginTop: "12px" }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "9px", background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)" }}>
          <span style={{ fontSize: "var(--text-2xs)", textTransform: "capitalize", color: "var(--text-muted)" }}>{key}</span>
          <strong style={{ fontSize: "var(--text-base)" }}>{value}</strong>
        </div>
      ))}
    </div>
  );
}
