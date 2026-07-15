import React from "react";

export interface ProgressBarProps {
  
  percent: number;
  
  width?: number;
}

export function ProgressBar({ percent = 0, width = 180 }: ProgressBarProps) {
  return (
    <div style={{ width, height: 8, borderRadius: "var(--radius-pill)", background: "var(--surface-control)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, percent))}%`, background: "var(--accent)" }} />
    </div>
  );
}
