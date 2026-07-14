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
    <header className="appHeader">
      <div className="brandLockup">
        <div className="starMark" aria-hidden="true">✦</div>
        <div>
          <h1>NorthStar</h1>
          <p className="motto">In Via Recta Celeriter</p>
          <p className="brandDescription">Personal, SMSF and consolidated investment reporting</p>
        </div>
      </div>
      <div className="headerControls">
        <TabBar value={scope} onChange={(value) => onScopeChange(value as Scope)} options={scopeOptions} />
        <nav className="headerLinks" aria-label="NorthStar tools">
          <Link href="/imports">Imports</Link>
          <Link href="/cash">Cash</Link>
          <Link href="/assets">Platinum</Link>
          <PwaInstallButton />
        </nav>
      </div>
    </header>
  );
}
