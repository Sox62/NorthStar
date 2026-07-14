"use client";

import Link from "next/link";
import type { Scope } from "@/lib/storage";
import { TabBar } from "@/northstar/components";
import PwaInstallButton from "@/components/PwaInstallButton";

const scopeOptions = [
  { value: "overall", label: "Overall" },
  { value: "personal", label: "Personal" },
  { value: "smsf", label: "SMSF" },
];

export default function AppHeader({ scope, onScopeChange }: { scope: Scope; onScopeChange: (scope: Scope) => void }) {
  return (
    <header className="appMasthead">
      <div className="mastheadTopline">
        <div className="brandLockup">
          <div className="starMark" aria-hidden="true"><span>✦</span></div>
          <div>
            <div className="brandTitleRow">
              <h1>NorthStar</h1>
              <span className="privateBadge">Private</span>
            </div>
            <p className="motto">In Via Recta Celeriter</p>
          </div>
        </div>

        <nav className="primaryNav" aria-label="NorthStar tools">
          <Link href="/" className="isActive">Overview</Link>
          <Link href="/imports">Imports</Link>
          <Link href="/cash">Cash</Link>
          <Link href="/assets">Platinum</Link>
          <PwaInstallButton />
        </nav>
      </div>

      <div className="mastheadContext">
        <div>
          <p className="eyebrow">Portfolio intelligence</p>
          <p className="mastheadDescription">Personal, SMSF and consolidated investment reporting in one private view.</p>
        </div>
        <TabBar value={scope} onChange={(value) => onScopeChange(value as Scope)} options={scopeOptions} />
      </div>
    </header>
  );
}
