export interface ProgressBarProps {
  percent: number;
  width?: number;
}

export function ProgressBar({ percent = 0, width }: ProgressBarProps) {
  return (
    <div className="nsProgress" style={width ? { width } : undefined}>
      <span style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}
