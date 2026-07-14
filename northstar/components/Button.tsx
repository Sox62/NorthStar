import React from "react";

import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  
  variant?: "default" | "primary" | "ghost";
  disabled?: boolean;
}

const base = {
  padding: "9px 14px",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-control)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  textDecoration: "none",
  font: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
};

export function Button({ variant = "default", disabled = false, children, style, ...rest }: ButtonProps) {
  const variantStyle =
    variant === "primary"
      ? { background: "var(--accent)", color: "var(--accent-contrast)", borderColor: "var(--accent)", fontWeight: "var(--weight-bold)" }
      : variant === "ghost"
      ? { background: "transparent", border: "0", borderRadius: 0, color: "var(--accent)", padding: 0 }
      : {};
  return (
    <button
      type="button"
      disabled={disabled}
      style={{ ...base, ...variantStyle, opacity: disabled ? 0.55 : 1, cursor: disabled ? "wait" : "pointer", ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
