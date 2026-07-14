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
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  return (
    <div className="nsSplit">
      <div className="nsSplitTrack" aria-hidden="true">
        {segments.map((segment) => (
          <span
            key={segment.label}
            style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }}
          />
        ))}
      </div>
      {showLegend && (
        <div className="nsSplitLegend">
          {segments.map((segment) => (
            <div key={segment.label}>
              <span className="nsLegendDot" style={{ background: segment.color }} />
              <span>{segment.label}</span>
              <strong>{segment.display ?? segment.value}</strong>
              {segment.pct != null && <em>{segment.pct}%</em>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
