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
      { title: "Passkeys", status: "planned", detail: "Replace Basic Auth with WebAuthn after core accounting contracts settle." },
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
      { title: "Personal and SMSF accounts", status: "shipped", detail: "Storage, dashboard queries and the overview account breakdown preserve legal ownership." },
      { title: "IBKR current positions", status: "shipped", detail: "Flex Open Positions replace the broker snapshot." },
      { title: "Physical platinum", status: "shipped", detail: "Kilogram holdings are valued from ABC buyback prices." },
      { title: "Expanded asset taxonomy", status: "in_progress", detail: "Current classification covers major portfolio sectors; options/property/crypto remain future work." },
      { title: "Core accounting module", status: "planned", detail: "Move valuation and analytics rules out of storage adapters into a dedicated core layer." },
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
      { title: "Sharesight API", status: "planned", detail: "Add once API credentials and target data contracts are confirmed." },
      { title: "Directshares path", status: "planned", detail: "Prefer API, then Sharesight, then contract-note parsing." },
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
      { title: "ASX/NYSE/TSX end-of-day prices", status: "planned", detail: "Persist daily security prices and source timestamps." },
      { title: "Metals pricing", status: "planned", detail: "Add gold, silver, palladium and rhodium price sources." },
      { title: "FX rates", status: "planned", detail: "Store daily AUD conversion rates for non-AUD positions." },
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
      { title: "XIRR", status: "planned", detail: "Money-weighted return by account and consolidated." },
      { title: "Exposure analysis", status: "shipped", detail: "Currency, commodity and allocation drift are live; allocation targets can be edited and are used in dashboard and CSV exports." },
      { title: "Tax position", status: "planned", detail: "CGT, dividend and realised/unrealised reporting." },
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
      { title: "Tax report", status: "planned", detail: "CGT, dividend and income export." },
      { title: "Estate summary", status: "shipped", detail: "Ownership-aware CSV export separates Personal and SMSF assets, accounts and NAV." },
      { title: "Wealth statement", status: "shipped", detail: "CSV export generates consolidated, account, allocation, drift, currency, return and holding rows." },
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
