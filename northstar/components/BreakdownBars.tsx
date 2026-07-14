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
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="nsBreakdown">
      {items.map((item) => (
        <div className="nsBreakdownRow" key={item.label}>
          <span className="nsBreakdownLabel">{item.label}</span>
          <div className="nsBreakdownTrack">
            <span style={{ width: `${(item.value / max) * 100}%`, background: item.color || "var(--accent)" }} />
          </div>
          <strong>{item.display ?? item.value}</strong>
        </div>
      ))}
    </div>
  );
}
