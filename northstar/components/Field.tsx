import React from "react";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldProps {
  
  label: string;
  
  as?: "input" | "select";
  
  options?: FieldOption[];
  style?: React.CSSProperties;
  type?: string;
  value?: string | number;
  placeholder?: string;
  required?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  marginTop: "16px",
  color: "var(--text-muted)",
  fontSize: "var(--text-sm)",
};

const controlStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-sunken)",
  color: "var(--text-primary)",
  font: "inherit",
};

export function Field({ label, as = "input", options, style, ...rest }: FieldProps) {
  return (
    <label style={{ ...fieldStyle, ...style }}>
      <span>{label}</span>
      {as === "select" ? (
        <select style={controlStyle} {...rest}>
          {(options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input style={controlStyle} {...rest} />
      )}
    </label>
  );
}
