import React from "react";

export interface StatusBadgeProps {
  
  tone?: "good" | "warning" | "bad";
  children: React.ReactNode;
}

const TONES = {
  good: { bg: "var(--status-good-bg)", fg: "var(--status-good-fg)" },
  warning: { bg: "var(--status-warning-bg)", fg: "var(--status-warning)" },
  bad: { bg: "var(--result-error-bg)", fg: "var(--status-negative)" },
} as const;

export function StatusBadge({ tone = "good", children }: StatusBadgeProps) {
  const { bg, fg } = TONES[tone] ?? TONES.good;
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
