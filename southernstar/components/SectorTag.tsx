import React from "react";

export interface SectorTagProps {
  label: string;
  
  color?: string;
}

export function SectorTag({ label, color = "#8ea0b2" }: SectorTagProps) {
  return (
    <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.04em", padding: "3px 8px", borderRadius: "6px", whiteSpace: "nowrap", background: color + "22", color }}>
      {label}
    </span>
  );
}
