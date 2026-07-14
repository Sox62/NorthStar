import React from "react";

export interface TabOption {
  value: string;
  label: string;
}

export interface TabBarProps {
  value: string;
  onChange: (value: string) => void;
  options: TabOption[];
}

export function TabBar({ value, onChange, options }: TabBarProps) {
  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            padding: "9px 14px",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-pill)",
            background: value === opt.value ? "var(--accent)" : "var(--surface-control)",
            color: value === opt.value ? "var(--accent-contrast)" : "var(--text-secondary)",
            fontWeight: value === opt.value ? "var(--weight-bold)" : "var(--weight-regular)",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
