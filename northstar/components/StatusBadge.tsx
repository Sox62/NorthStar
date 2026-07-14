import React from "react";

export interface StatusBadgeProps {
  
  tone?: "good" | "warning";
  children: React.ReactNode;
}

export function StatusBadge({ tone = "good", children }: StatusBadgeProps) {
  const bg = tone === "warning" ? "var(--status-warning-bg)" : "var(--status-good-bg)";
  const fg = tone === "warning" ? "var(--status-warning)" : "var(--status-good-fg)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: "var(--radius-pill)",
        background: bg,
        color: fg,
        fontSize: "var(--text-xs)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
