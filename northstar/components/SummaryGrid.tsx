import React from "react";

type SummaryGridTone = "positive" | "negative";
type SummaryGridEntry = [string, React.ReactNode] | [string, React.ReactNode, SummaryGridTone];

export interface SummaryGridProps {
  entries: SummaryGridEntry[];
}

export function SummaryGrid({ entries = [] }: SummaryGridProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "9px", marginTop: "12px" }}>
      {entries.map(([key, value, tone]) => (
        <div key={key} style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "9px", background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)" }}>
          <span style={{ fontSize: "var(--text-2xs)", textTransform: "capitalize", color: "var(--text-muted)" }}>{key}</span>
          <strong className={tone} style={{ fontSize: "var(--text-base)" }}>{value}</strong>
        </div>
      ))}
    </div>
  );
}
