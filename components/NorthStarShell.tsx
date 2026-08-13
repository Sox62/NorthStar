"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NavRail } from "@/northstar/components/NavRail";

function activeForPath(pathname: string) {
  if (pathname === "/") return "overview";
  if (pathname.startsWith("/accounts")) return "accounts-mandates";
  if (pathname.startsWith("/holdings")) return "holdings";
  if (pathname.startsWith("/prices")) return "prices";
  if (pathname.startsWith("/sync") || pathname.startsWith("/imports")) return "sync";
  if (pathname.startsWith("/sectors")) return "sectors";
  if (pathname.startsWith("/targets")) return "targets";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/tax")) return "tax";
  if (pathname.startsWith("/security")) return "security";
  if (pathname.startsWith("/fundamentals")) return "fundamentals-risk";
  if (pathname.startsWith("/assets")) return "bullion";
  if (pathname.startsWith("/cash")) return "cash";
  return "overview";
}

function isFullPage(pathname: string) {
  return pathname.startsWith("/login") || pathname.startsWith("/reports/eofy") || pathname.startsWith("/reports/tax") || pathname.startsWith("/reports/wealth");
}

export default function NorthStarShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isFullPage(pathname)) return <>{children}</>;

  return (
    <div className="nsScreen nsPersistentShell">
      <NavRail active={activeForPath(pathname)} />
      <div className="nsShellContent">{children}</div>
    </div>
  );
}
