export type NavigationItem = { key: string; label: string; href: string; icon: string; detail: string; aliases?: string[] };
export type NavigationSection = { label: string; items: NavigationItem[] };

/** Desktop and mobile share labels, groups, order and destinations. */
export const navigationSections: NavigationSection[] = [
  { label: "Overview", items: [
    { key: "overview", label: "State of play", href: "/", icon: "overview", detail: "Portfolio dashboard" },
  ] },
  { label: "Capital", items: [
    { key: "holdings", label: "Capital", href: "/holdings", icon: "holdings", detail: "Share allocation" },
    { key: "accounts-mandates", label: "Accounts & mandates", href: "/accounts", icon: "reports", detail: "Legal books" },
    { key: "cash", label: "Cash accounts", href: "/cash", icon: "cash", detail: "Bank balances" },
    { key: "targets", label: "Armed list", href: "/targets", icon: "targets", detail: "Allocation targets" },
  ] },
  { label: "Discipline", items: [
    { key: "sectors", label: "Positions & strategy", href: "/sectors", icon: "sectors", detail: "Exposure and strategy" },
    { key: "position-sizer", label: "Position sizer", href: "/sizer", icon: "targets", detail: "Size a position" },
    { key: "stops-orders", label: "Stops & orders", href: "/risk", icon: "security", detail: "Portfolio risk" },
  ] },
  { label: "Analysis", items: [
    { key: "opportunities", label: "Opportunities", href: "/opportunities", icon: "targets", detail: "Research candidates" },
    { key: "rari-regime", label: "RARI regime", href: "/regime/rari", icon: "prices", detail: "Market regime" },
    { key: "relative-leadership", label: "Relative leadership", href: "/relative", icon: "prices", detail: "Ratio charts" },
    { key: "prices", label: "Chart workbench", href: "/prices", icon: "prices", detail: "Market charts" },
    { key: "relative-calculator", label: "Relative calculator", href: "/relative/calculator", icon: "targets", detail: "Manual ratios" },
    { key: "fundamentals-risk", label: "Fundamentals & risk", href: "/fundamentals", icon: "security", detail: "Miner risk queue" },
  ] },
  { label: "Reports", items: [
    { key: "reports", label: "Report library", href: "/reports", icon: "reports", detail: "Exports and accountant packs" },
    { key: "tax", label: "Tax positions", href: "/tax", icon: "tax", detail: "Realised and unrealised" },
    { key: "tax-evidence", label: "Tax evidence", href: "/reports/tax-evidence", icon: "reports", detail: "FX, transfers and sources" },
  ] },
  { label: "Data", items: [
    { key: "bullion", label: "Physical metals", href: "/assets", icon: "bullion", detail: "Bullion holdings" },
    { key: "sync", label: "Imports", href: "/sync", icon: "sync", detail: "Feeds and status", aliases: ["/imports"] },
    { key: "security", label: "Security", href: "/security", icon: "security", detail: "Access methods" },
  ] },
];

export function activeNavigationKey(pathname: string) {
  return navigationSections.flatMap((section) => section.items)
    .flatMap((item) => [item.href, ...(item.aliases ?? [])].map((path) => ({ key: item.key, path })))
    .sort((a, b) => b.path.length - a.path.length)
    .find(({ path }) => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)))?.key ?? "overview";
}

export function isFullPageRoute(pathname: string) {
  return ["/login", "/reports/eofy", "/reports/tax", "/reports/wealth"]
    .some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
