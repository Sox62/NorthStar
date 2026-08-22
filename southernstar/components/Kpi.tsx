import React from "react";
import { Card } from "./Card";
import { StatusBadge } from "./StatusBadge";

export interface KpiProps {
  label: string;
  value: React.ReactNode;
  
  tone?: "default" | "positive" | "negative" | "warning";
  
  badge?: boolean;
}

export function Kpi({ label, value, tone, badge = false }: KpiProps) {
  const color = tone === "positive" ? "var(--status-positive)" : tone === "negative" ? "var(--status-negative)" : tone === "warning" ? "var(--status-warning)" : "var(--text-primary)";
  return (
    <Card>
      <div style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", marginTop: "8px", color }}>
        {badge ? <StatusBadge tone={tone === "warning" ? "warning" : "good"}>{value}</StatusBadge> : value}
      </div>
    </Card>
  );
}
