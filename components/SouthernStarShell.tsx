"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NavRail } from "@/southernstar/components/NavRail";
import { activeNavigationKey, isFullPageRoute } from "@/lib/navigation";

export default function SouthernStarShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isFullPageRoute(pathname)) return <>{children}</>;

  return (
    <div className="nsScreen nsPersistentShell">
      <NavRail active={activeNavigationKey(pathname)} />
      <div className="nsShellContent">{children}</div>
    </div>
  );
}
