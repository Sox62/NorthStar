"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { activeNavigationKey, navigationSections } from "@/lib/navigation";

export default function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = activeNavigationKey(pathname);

  return (
    <div className="mobileMenu">
      <button
        type="button"
        className="mobileMenuButton"
        aria-expanded={open}
        aria-controls="southernstar-mobile-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span>Menu</span>
      </button>

      {open && <button type="button" className="mobileMenuOverlay" aria-label="Close menu" onClick={() => setOpen(false)} />}

      {open && (
        <aside id="southernstar-mobile-menu" className="mobileMenuDrawer isOpen" aria-label="SouthernStar mobile navigation">
          <div className="mobileMenuHeader">
            <div className="mobileMenuBrand">
              <span className="miniStar" aria-hidden="true">✦</span>
              <div>
                <strong>SouthernStar</strong>
                <span>Private portfolio operations</span>
              </div>
            </div>
            <button type="button" className="mobileMenuClose" aria-label="Close menu" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <nav className="mobileMenuNav" aria-label="Primary navigation">
            {navigationSections.map((section) => <section className="mobileMenuSection" key={section.label} aria-label={section.label}>
              <h2>{section.label}</h2>
              {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={active === item.key ? "isActive" : undefined}
                aria-current={active === item.key ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span>{item.label}</span>
                <em>{item.detail}</em>
              </Link>
              ))}
            </section>)}
          </nav>
        </aside>
      )}
    </div>
  );
}
