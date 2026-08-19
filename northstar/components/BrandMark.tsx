import React from "react";

/**
 * The Southern Cross, taken from the SouthernStar design. Five four-pointed stars, the fifth
 * (Epsilon) dimmed as it is in the sky. Inline SVG rather than a bitmap so it stays sharp at any
 * size and inherits the surrounding theme.
 */
export function BrandMark({ size = 38, title = "SouthernStar" }: { size?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      style={{ borderRadius: Math.max(6, Math.round(size / 3.8)), background: "#0d1a28", border: "1px solid #213244", flex: "0 0 auto" }}
    >
      <polygon points="21.0,4.9 21.9,7.6 24.6,8.5 21.9,9.4 21.0,12.1 20.1,9.4 17.4,8.5 20.1,7.6" fill="#d7b56d" />
      <polygon points="18.2,28.1 19.3,31.4 22.6,32.5 19.3,33.6 18.2,36.9 17.1,33.6 13.8,32.5 17.1,31.4" fill="#d7b56d" />
      <polygon points="8.8,16.4 9.8,19.2 12.6,20.2 9.8,21.2 8.8,24.0 7.8,21.2 5.0,20.2 7.8,19.2" fill="#d7b56d" />
      <polygon points="31.2,13.7 32.0,16.0 34.3,16.8 32.0,17.6 31.2,19.9 30.4,17.6 28.1,16.8 30.4,16.0" fill="#d7b56d" />
      <polygon points="16.4,22.3 16.9,23.7 18.3,24.2 16.9,24.7 16.4,26.1 15.9,24.7 14.5,24.2 15.9,23.7" fill="#d7b56d" opacity="0.75" />
    </svg>
  );
}
