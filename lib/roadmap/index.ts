export type RoadmapStatus = "shipped" | "in_progress" | "planned" | "blocked";

export type RoadmapItem = {
  title: string;
  status: RoadmapStatus;
  detail: string;
};

export type RoadmapPhase = {
  id: string;
  phase: string;
  title: string;
  objective: string;
  status: RoadmapStatus;
  items: RoadmapItem[];
};

export const statusLabels: Record<RoadmapStatus, string> = {
  shipped: "Shipped",
  in_progress: "In progress",
  planned: "Planned",
  blocked: "Blocked",
};

export const roadmapPhases: RoadmapPhase[] = [
  {
    id: "foundation",
    phase: "Phase 1",
    title: "Foundation",
    objective: "Stabilise the production app, release process and operating model.",
    status: "in_progress",
    items: [
      { title: "Screenshot dashboard", status: "shipped", detail: "Overview shell and seeded assessment data are running." },
      { title: "GitHub and Railway release path", status: "shipped", detail: "Main branch deploys to the existing Railway service." },
      { title: "Daily auto-sync", status: "shipped", detail: "Railway start process schedules the protected sync endpoint each morning." },
      { title: "Passkeys", status: "shipped", detail: "Passkey setup and sign-in are live; password login remains the recovery path and legacy Basic Auth is opt-in only." },
      { title: "Backups and recovery runbook", status: "shipped", detail: "PostgreSQL backup, restore drill, production recovery and rollback steps are documented." },
    ],
  },
  {
    id: "portfolio-core",
    phase: "Phase 2",
    title: "Portfolio Core",
    objective: "Make accounts, positions, transactions, cash and physical assets the trusted source of truth.",
    status: "in_progress",
    items: [
      { title: "Personal and SMSF accounts", status: "shipped", detail: "Storage, dashboard queries, full holdings view and overview account breakdown preserve legal ownership." },
      { title: "IBKR current positions", status: "shipped", detail: "Flex Open Positions replace the broker snapshot." },
      { title: "Physical platinum", status: "shipped", detail: "Kilogram holdings are valued from ABC buyback prices." },
      { title: "Expanded asset taxonomy", status: "shipped", detail: "Current classification covers live NorthStar sectors, Directshares foreign suffixes and known VELO/LAM exceptions; options/property/crypto remain future extensions." },
      { title: "Core accounting module", status: "shipped", detail: "Shared core accounting now builds dashboard valuation, return, allocation, owner-scope and manual-asset calculations for both storage adapters." },
    ],
  },
  {
    id: "automation",
    phase: "Phase 3",
    title: "Automation",
    objective: "Reduce manual imports and make data freshness visible.",
    status: "in_progress",
    items: [
      { title: "IBKR manual sync", status: "shipped", detail: "Broker Imports can trigger Flex sync on demand." },
      { title: "IBKR scheduled sync", status: "shipped", detail: "Morning sync runs from the Railway web process." },
      { title: "Sharesight feed", status: "planned", detail: "Use as a reconciliation/import source once API or export access and target data contracts are confirmed." },
      { title: "Directshares contract notes", status: "shipped", detail: "Manual PDF upload and scheduled mailbox sync parse broker confirmations with duplicate detection." },
      { title: "Directshares dividend notices", status: "shipped", detail: "Manual import and scheduled mailbox sync parse dividend emails, AUD proceeds and withholding tax." },
      { title: "Sync run monitor", status: "shipped", detail: "Dashboard shows latest IBKR and ABC Bullion status plus recent sync and pricing activity." },
    ],
  },
  {
    id: "pricing",
    phase: "Phase 4",
    title: "Pricing",
    objective: "Build auditable daily valuation from market, metals and FX sources.",
    status: "in_progress",
    items: [
      { title: "ABC platinum buyback", status: "shipped", detail: "Physical platinum values update from ABC Bullion." },
      { title: "ASX/NYSE/TSX end-of-day prices", status: "in_progress", detail: "Manual, CSV, scheduled and provider-selected delayed quote refreshes persist to the price ledger with visible quote/failure audit details; full vendor coverage remains." },
      { title: "Metals pricing", status: "planned", detail: "Add gold, silver, palladium and rhodium price sources." },
      { title: "FX rates", status: "shipped", detail: "Daily AUD conversion rates can be stored manually, provider-refreshed through EODHD or Frankfurter, or inferred from current broker valuations." },
      { title: "Price audit trail", status: "shipped", detail: "Dashboard valuation checks flag stale data and cost-basis fallback positions." },
    ],
  },
  {
    id: "analytics",
    phase: "Phase 5",
    title: "Analytics",
    objective: "Turn stored portfolio data into return, risk and tax insight.",
    status: "in_progress",
    items: [
      { title: "NAV history", status: "shipped", detail: "Overview chart is wired to portfolio snapshots for Overall, Personal and SMSF views." },
      { title: "Period returns", status: "shipped", detail: "Dashboard shows daily, MTD, YTD and since-inception NAV movement from snapshots." },
      { title: "XIRR", status: "shipped", detail: "Cash-flow XIRR is live by account and consolidated, using imported transactions plus cost-basis fallback positions where history is incomplete." },
      { title: "Exposure analysis", status: "shipped", detail: "Currency, commodity and allocation drift are live; allocation targets can be edited and are used in dashboard and CSV exports." },
      { title: "Tax position", status: "shipped", detail: "FIFO realised CGT, unrealised CGT, dividend income, franking credits and withholding tax are exported for the Personal tax pack." },
    ],
  },
  {
    id: "reports",
    phase: "Phase 6",
    title: "Reports",
    objective: "Generate repeatable reports from stored, dated portfolio snapshots.",
    status: "in_progress",
    items: [
      { title: "SMSF report", status: "shipped", detail: "Scoped CSV export covers SMSF holdings, allocations, allocation drift, currency exposure and period returns." },
      { title: "Personal report", status: "shipped", detail: "Scoped CSV export covers personal holdings, allocations, allocation drift, currency exposure and period returns." },
      { title: "Tax report", status: "shipped", detail: "Personal EOFY pack exports CGT summary, realised lots, unrealised lots, taxable income, historical cost and trade movements." },
      { title: "Estate summary", status: "shipped", detail: "Ownership-aware CSV export separates Personal and SMSF assets, accounts and NAV." },
      { title: "Wealth statement", status: "shipped", detail: "Reports hub links consolidated, account, allocation, drift, currency, return and holding CSV rows." },
    ],
  },
];

export function roadmapSummary(phases = roadmapPhases) {
  const items = phases.flatMap((phase) => phase.items);
  const counts = items.reduce<Record<RoadmapStatus, number>>(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { shipped: 0, in_progress: 0, planned: 0, blocked: 0 },
  );
  const completed = counts.shipped;
  const total = items.length;
  return {
    total,
    completed,
    percentComplete: total ? Math.round((completed / total) * 100) : 0,
    counts,
  };
}
