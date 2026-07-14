import type { HTMLAttributes, ReactNode } from "react";

export interface RowProps extends HTMLAttributes<HTMLDivElement> {
  left: ReactNode;
  right?: ReactNode;
}

export function Row({ left, right, style, ...rest }: RowProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        padding: "11px 0",
        borderBottom: "1px solid var(--border-default)",
        ...style,
      }}
      {...rest}
    >
      <div>{left}</div>
      {right !== undefined && <div style={{ textAlign: "right" }}>{right}</div>}
    </div>
  );
}
