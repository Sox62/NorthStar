import React from "react";

export interface PageNavLink {
  href: string;
  label: string;
}

export interface PageNavProps {
  links: PageNavLink[];
}

export function PageNav({ links }: PageNavProps) {
  return (
    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "space-between", margin: "0 0 24px" }}>
      {links.map((link) => (
        <a key={link.href} href={link.href} style={{ color: "var(--accent)", textDecoration: "none" }}>
          {link.label}
        </a>
      ))}
    </div>
  );
}
