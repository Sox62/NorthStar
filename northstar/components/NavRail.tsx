"use client";
import React from "react";

const items = [
  { key: "overview", label: "Overview", href: "/" },
  { key: "holdings", label: "Holdings", href: "/#holdings" },
  { key: "sectors", label: "Sectors", href: "/sectors" },
  { key: "targets", label: "Targets", href: "/targets" },
  { key: "bullion", label: "Bullion", href: "/assets" },
  { key: "cash", label: "Cash", href: "/cash" },
];

const icons: Record<string, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  holdings: <path d="M4 19V5m0 14h16M8 15l3-4 3 2 4-6" />,
  sectors: <path d="M12 3v18M7 8h8a3 3 0 010 6H7m0-6l-2-2m2 2l-2 2" />,
  targets: <><path d="M4 19h16" /><path d="M7 16V9" /><path d="M12 16V5" /><path d="M17 16v-4" /></>,
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
        {items.map((it) => {
          const on = it.key === active;
          return (
            <a key={it.key} href={it.href} onClick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(it.key); } }}
              className={on ? "isActive" : undefined}>
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8}>{icons[it.key]}</svg>
              {it.label}
            </a>
          );
        })}
      </nav>
      <div className="nsRailFooter">
        <div><b>{owner}</b> · Trustee</div>
        <div>Inception late May 2025.</div>
      </div>
    </aside>
  );
}
