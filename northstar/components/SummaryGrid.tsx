import type { ReactNode } from "react";

export interface SummaryGridProps {
  entries: Array<[string, ReactNode]>;
}

export function SummaryGrid({ entries = [] }: SummaryGridProps) {
  return (
    <div className="nsSummaryGrid">
      {entries.map(([key, value]) => (
        <div className="nsSummaryItem" key={key}>
          <span>{key}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
