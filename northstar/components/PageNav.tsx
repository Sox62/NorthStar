import type { ReactNode } from "react";

export interface PageNavLink {
  href: string;
  label: ReactNode;
}

export interface PageNavProps {
  links: PageNavLink[];
}

export function PageNav({ links }: PageNavProps) {
  return (
    <nav className="pageNav" aria-label="Page navigation">
      {links.map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
    </nav>
  );
}
