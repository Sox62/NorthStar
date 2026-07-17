"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Overview", detail: "Portfolio dashboard" },
  { href: "/holdings", label: "Holdings", detail: "All positions" },
  { href: "/prices", label: "Pricing", detail: "Market closes" },
  { href: "/sectors", label: "Sectors", detail: "Exposure breakdown" },
  { href: "/targets", label: "Targets", detail: "Allocation drift" },
  { href: "/imports", label: "Imports", detail: "Broker sync" },
  { href: "/cash", label: "Cash", detail: "Bank balances" },
  { href: "/assets", label: "Bullion", detail: "Physical metals" },
  { href: "/reports", label: "Reports", detail: "Exports" },
  { href: "/security", label: "Security", detail: "Access methods" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="mobileMenu">
      <button
        type="button"
        className="mobileMenuButton"
        aria-expanded={open}
        aria-controls="northstar-mobile-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span>Menu</span>
      </button>

      {open && <button type="button" className="mobileMenuOverlay" aria-label="Close menu" onClick={() => setOpen(false)} />}

      {open && (
        <aside id="northstar-mobile-menu" className="mobileMenuDrawer isOpen" aria-label="NorthStar mobile navigation">
          <div className="mobileMenuHeader">
            <div className="mobileMenuBrand">
              <span className="miniStar" aria-hidden="true">✦</span>
              <div>
                <strong>NorthStar</strong>
                <span>Private portfolio operations</span>
              </div>
            </div>
            <button type="button" className="mobileMenuClose" aria-label="Close menu" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <nav className="mobileMenuNav">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(pathname, item.href) ? "isActive" : undefined}
                onClick={() => setOpen(false)}
              >
                <span>{item.label}</span>
                <em>{item.detail}</em>
              </Link>
            ))}
          </nav>
        </aside>
      )}
    </div>
  );
}
