import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, style, ...rest }: CardProps) {
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-xl)",
        padding: "18px",
        boxShadow: "var(--shadow-card)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
