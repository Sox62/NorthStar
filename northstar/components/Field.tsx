import type { CSSProperties, ChangeEvent, InputHTMLAttributes, SelectHTMLAttributes } from "react";

export interface FieldOption {
  value: string;
  label: string;
}

type SharedProps = {
  label: string;
  style?: CSSProperties;
};

type InputFieldProps = SharedProps & {
  as?: "input";
  options?: never;
  controlProps?: InputHTMLAttributes<HTMLInputElement>;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
};

type SelectFieldProps = SharedProps & {
  as: "select";
  options: FieldOption[];
  controlProps?: SelectHTMLAttributes<HTMLSelectElement>;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
};

export type FieldProps = InputFieldProps | SelectFieldProps;

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  marginTop: "16px",
  color: "var(--text-muted)",
  fontSize: "var(--text-sm)",
};

const controlStyle: CSSProperties = {
  width: "100%",
  padding: "11px",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-sunken)",
  color: "var(--text-primary)",
  font: "inherit",
};

export function Field(props: FieldProps) {
  if (props.as === "select") {
    return (
      <label style={{ ...fieldStyle, ...props.style }}>
        <span>{props.label}</span>
        <select style={controlStyle} {...props.controlProps} onChange={props.onChange}>
          {props.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label style={{ ...fieldStyle, ...props.style }}>
      <span>{props.label}</span>
      <input style={controlStyle} {...props.controlProps} onChange={props.onChange} />
    </label>
  );
}
