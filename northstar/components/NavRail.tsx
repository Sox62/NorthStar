"use client";
import React from "react";
import MobileMenu from "@/components/MobileMenu";

const sections = [
  {
    label: "Layer 1 — state of play",
    items: [{ key: "overview", label: "State of play", href: "/" }],
  },
  {
    label: "Capital",
    items: [
      { key: "holdings", label: "Capital", href: "/holdings" },
      { key: "cash", label: "External cash", href: "/cash" },
      { key: "targets", label: "Armed list", href: "/targets" },
    ],
  },
  {
    label: "Discipline",
    items: [
      { key: "sectors", label: "Positions & strategy", href: "/sectors" },
      { key: "reports", label: "Harvest plan", href: "/reports" },
      { key: "tax", label: "Tax", href: "/tax" },
    ],
  },
  {
    label: "Layers 2-4 — analysis",
    items: [
      { key: "prices", label: "Chart workbench", href: "/prices" },
      { key: "security", label: "Security", href: "/security" },
    ],
  },
  {
    label: "Existing modules",
    items: [
      { key: "sync", label: "Imports", href: "/sync" },
      { key: "bullion", label: "Physical platinum", href: "/assets" },
    ],
  },
];

const items = sections.flatMap((section) => section.items);

const icons: Record<string, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  holdings: <path d="M4 19V5m0 14h16M8 15l3-4 3 2 4-6" />,
  prices: <><path d="M4 18h16" /><path d="M7 14l3-4 3 2 4-6" /><circle cx="7" cy="14" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="13" cy="12" r="1.4" /><circle cx="17" cy="6" r="1.4" /></>,
  sync: <><path d="M4 7h11a4 4 0 010 8H8" /><path d="M8 4L4 7l4 3" /><path d="M20 17H9a4 4 0 010-8h7" /><path d="M16 14l4 3-4 3" /></>,
  sectors: <path d="M12 3v18M7 8h8a3 3 0 010 6H7m0-6l-2-2m2 2l-2 2" />,
  targets: <><path d="M4 19h16" /><path d="M7 16V9" /><path d="M12 16V5" /><path d="M17 16v-4" /></>,
  reports: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
  tax: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h3" /><path d="M16 15.5a2 2 0 11-2-2" /></>,
  security: <><path d="M7 11V8a5 5 0 0110 0v3" /><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M12 15v2" /></>,
  bullion: <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5L12 21l-4.9-2.8 1-5.5-4-3.9L10.5 8z" />,
  cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></>,
};

export interface NavRailProps {
  active?: string;
  /** Optional logo <img src>. Falls back to a gold ✦ glyph. */
  logoSrc?: string;
  owner?: string;
  onNavigate?: (key: string) => void;
}

export function NavRail({ active = "overview", logoSrc, owner = "Stephen", onNavigate }: NavRailProps) {
  return (
    <>
      <div className="nsMobileBar">
        <div className="mobileMenuBrand">
          <span className="miniStar" aria-hidden="true">✦</span>
          <div>
            <strong>NorthStar</strong>
            <span>Private portfolio operations</span>
          </div>
        </div>
        <MobileMenu />
      </div>
      <aside className="nsRail">
        <div className="nsRailBrand">
          {logoSrc
            ? <img src={logoSrc} alt="NorthStar" className="nsRailLogo" />
            : <div className="nsRailMark"><span>✦</span><small>NS</small></div>}
          <div>
            <div className="nsRailTitle">NorthStar</div>
            <div className="nsRailMotto">In Via Recta Celeriter</div>
          </div>
        </div>
        <nav className="nsRailNav">
          {sections.map((section) => (
            <div className="nsRailSection" key={section.label}>
              <p>{section.label}</p>
              {section.items.map((it) => {
                const on = it.key === active;
                return (
                  <a key={it.key} href={it.href} onClick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(it.key); } }}
                    className={on ? "isActive" : undefined}>
                    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8}>{icons[it.key]}</svg>
                    {it.label}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="nsRailFooter">
          <div><b>{owner}</b> · Trustee</div>
          <div>Layers 1-4 · amended brief</div>
        </div>
      </aside>
    </>
  );
}
