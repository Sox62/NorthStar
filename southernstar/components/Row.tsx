import React from "react";

export interface RowProps {
  left: React.ReactNode;
  right?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Row({ left, right, style, ...rest }: RowProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "11px 0", borderBottom: "1px solid var(--border-default)", ...style }} {...rest}>
      <div>{left}</div>
      {right && <div style={{ textAlign: "right" }}>{right}</div>}
    </div>
  );
}
