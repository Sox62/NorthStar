import React from "react";

export interface SplitSegment {
  label: string;
  value: number;
  color: string;
  
  display?: string;
  
  pct?: number;
}

export interface SplitBarProps {
  segments: SplitSegment[];
  showLegend?: boolean;
}

export function SplitBar({ segments = [], showLegend = true }: SplitBarProps) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", gap: 2 }}>
        {segments.map((s, i) => (
          <span key={i} style={{ display: "block", width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      {showLegend && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, fontSize: "12.5px", color: "var(--text-muted)" }}>
          {segments.map((s, i) => (
            <div key={i}>
              <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, marginRight: 7, verticalAlign: "middle", background: s.color }} />
              {s.label} <b style={{ color: "var(--text-primary)", fontWeight: 600 }}>{s.display ?? s.value}</b>
              {s.pct != null && ` · ${s.pct}%`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
