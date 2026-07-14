import type { ReactNode } from "react";
import { StatusBadge } from "./StatusBadge";

export interface KpiProps {
  label: string;
  value: ReactNode;
  tone?: "default" | "positive" | "negative" | "warning";
  badge?: boolean;
  note?: ReactNode;
}

export function Kpi({ label, value, tone = "default", badge = false, note }: KpiProps) {
  return (
    <div className={`nsKpi nsKpi--${tone}`}>
      <div className="nsKpiLabel">{label}</div>
      <div className="nsKpiValue">
        {badge ? <StatusBadge tone={tone === "warning" ? "warning" : "good"}>{value}</StatusBadge> : value}
      </div>
      {note && <div className="nsKpiNote">{note}</div>}
    </div>
  );
}
