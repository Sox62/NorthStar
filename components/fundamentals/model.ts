import type { DashboardData, FundamentalResearchDraft, MinerFundamentals } from "@/lib/storage";
import type { Holding, Sector } from "@/southernstar/types";

export type FundamentalsState = {
  holdings: Holding[];
  fundamentals: MinerFundamentals[];
  drafts: FundamentalResearchDraft[];
  loading: boolean;
  error: string;
};

type FundamentalsResponse = {
  fundamentals?: MinerFundamentals[];
  error?: string;
};

type StarterResponse = FundamentalsResponse & {
  imported?: number;
  symbols?: string[];
};

type SaveFundamentalsResponse = {
  fundamental?: MinerFundamentals;
  error?: string;
};

type DraftsResponse = {
  drafts?: FundamentalResearchDraft[];
  draft?: FundamentalResearchDraft;
  fundamental?: MinerFundamentals;
  error?: string;
};

export type ResearchFormState = {
  symbol: string;
  name: string;
  primaryMetal: string;
  jurisdiction: string;
  projectStage: string;
  productionOz: string;
  aiscUsdPerOz: string;
  resourceMoz: string;
  reserveMoz: string;
  cashAud: string;
  debtAud: string;
  marketCapAud: string;
  npvAud: string;
  capexAud: string;
  irrPercent: string;
  jurisdictionScore: string;
  balanceSheetScore: string;
  dilutionScore: string;
  managementScore: string;
  sourceUrl: string;
  asOfDate: string;
  notes: string;
};

export type MetricDefinition = {
  label: string;
  field: string;
  reason: string;
};

export const minerSectors: Sector[] = ["Silver miners", "Gold miners", "Uranium miners", "Uranium explorers"];

export const blankResearchForm: ResearchFormState = {
  symbol: "",
  name: "",
  primaryMetal: "",
  jurisdiction: "",
  projectStage: "",
  productionOz: "",
  aiscUsdPerOz: "",
  resourceMoz: "",
  reserveMoz: "",
  cashAud: "",
  debtAud: "",
  marketCapAud: "",
  npvAud: "",
  capexAud: "",
  irrPercent: "",
  jurisdictionScore: "",
  balanceSheetScore: "",
  dilutionScore: "",
  managementScore: "",
  sourceUrl: "",
  asOfDate: "",
  notes: "",
};

/** Anchor for jumping from the workpage to the intake form. */
export const RESEARCH_FORM_ID = "research-intake";

const formText = (value: string | null | undefined) => value ?? "";
const formNumberText = (value: number | null | undefined) => value == null ? "" : String(value);

/**
 * Seed the intake form for one holding. Saving upserts the whole record, so an existing
 * research record must be loaded back into the form — starting blank would write its
 * populated fields away as nulls.
 */
export function researchFormForHolding(holding: Holding, saved: MinerFundamentals | undefined): ResearchFormState {
  return {
    ...blankResearchForm,
    symbol: holding.symbol.toUpperCase(),
    name: formText(saved?.name) || holding.name,
    primaryMetal: formText(saved?.primaryMetal),
    jurisdiction: formText(saved?.jurisdiction),
    projectStage: formText(saved?.projectStage),
    productionOz: formNumberText(saved?.productionOz),
    aiscUsdPerOz: formNumberText(saved?.aiscUsdPerOz),
    resourceMoz: formNumberText(saved?.resourceMoz),
    reserveMoz: formNumberText(saved?.reserveMoz),
    cashAud: formNumberText(saved?.cashAud),
    debtAud: formNumberText(saved?.debtAud),
    marketCapAud: formNumberText(saved?.marketCapAud),
    npvAud: formNumberText(saved?.npvAud),
    capexAud: formNumberText(saved?.capexAud),
    irrPercent: formNumberText(saved?.irrPercent),
    jurisdictionScore: formNumberText(saved?.jurisdictionScore),
    balanceSheetScore: formNumberText(saved?.balanceSheetScore),
    dilutionScore: formNumberText(saved?.dilutionScore),
    managementScore: formNumberText(saved?.managementScore),
    sourceUrl: formText(saved?.sourceUrl),
    asOfDate: formText(saved?.asOfDate).slice(0, 10),
    notes: formText(saved?.notes),
  };
}

export function researchFormForIdea(saved: MinerFundamentals): ResearchFormState {
  return {
    ...blankResearchForm,
    symbol: saved.symbol.toUpperCase(),
    name: formText(saved.name),
    primaryMetal: formText(saved.primaryMetal),
    jurisdiction: formText(saved.jurisdiction),
    projectStage: formText(saved.projectStage),
    productionOz: formNumberText(saved.productionOz),
    aiscUsdPerOz: formNumberText(saved.aiscUsdPerOz),
    resourceMoz: formNumberText(saved.resourceMoz),
    reserveMoz: formNumberText(saved.reserveMoz),
    cashAud: formNumberText(saved.cashAud),
    debtAud: formNumberText(saved.debtAud),
    marketCapAud: formNumberText(saved.marketCapAud),
    npvAud: formNumberText(saved.npvAud),
    capexAud: formNumberText(saved.capexAud),
    irrPercent: formNumberText(saved.irrPercent),
    jurisdictionScore: formNumberText(saved.jurisdictionScore),
    balanceSheetScore: formNumberText(saved.balanceSheetScore),
    dilutionScore: formNumberText(saved.dilutionScore),
    managementScore: formNumberText(saved.managementScore),
    sourceUrl: formText(saved.sourceUrl),
    asOfDate: formText(saved.asOfDate).slice(0, 10),
    notes: formText(saved.notes),
  };
}

export const metricDefinitions: MetricDefinition[] = [
  { label: "Production margin", field: "Spot price - AISC", reason: "Shows operating leverage before trusting a miner P/L number." },
  { label: "Balance sheet cover", field: "FCF / net debt", reason: "Flags whether debt can be handled at current metal prices." },
  { label: "Resource value", field: "Market cap / resource oz", reason: "Compares ounces in the ground without mixing it into portfolio NAV." },
  { label: "Ounces per share", field: "Resource oz / fully diluted shares", reason: "Keeps dilution visible when a story looks attractive." },
  { label: "Project economics", field: "NPV, capex, IRR", reason: "Separates good geology from financeable mine plans." },
  { label: "Risk score", field: "Jurisdiction, management, dilution, funding", reason: "Turns the checklist into a repeatable decision surface." },
];

export const checklist = [
  "AISC and all-in cost per ounce",
  "Annual production or expected production",
  "Measured, indicated and inferred resources",
  "Reserve life and mine life",
  "Cash, debt, fully diluted shares",
  "Project NPV, capex and IRR",
  "Jurisdiction and permitting notes",
  "Insider ownership, options and recent dilution",
];

export const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

export const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;

export function isMinerHolding(holding: Holding) {
  return minerSectors.includes(holding.sector);
}

export function scoreStatus(holding: Holding) {
  if (holding.valuationBasis === "cost_basis") return { label: "Needs market price", tone: "warning" as const };
  if (!holding.priceAsOfDate) return { label: "Needs price date", tone: "warning" as const };
  return { label: "Awaiting fundamentals", tone: "warning" as const };
}

export function totalValue(holdings: Holding[]) {
  return holdings.reduce((sum, holding) => sum + holding.marketValueAud, 0);
}

export function topRisk(holdings: Holding[]) {
  const sorted = [...holdings].sort((a, b) => b.marketValueAud - a.marketValueAud);
  return sorted[0] ?? null;
}

export function averageScore(fundamentals: MinerFundamentals | undefined) {
  if (!fundamentals) return null;
  const scores = [fundamentals.jurisdictionScore, fundamentals.balanceSheetScore, fundamentals.dilutionScore, fundamentals.managementScore]
    .filter((value): value is number => value != null);
  return scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
}

export function numberOrDash(value: number | null | undefined, suffix = "") {
  return value == null ? "-" : `${value.toLocaleString("en-AU", { maximumFractionDigits: 2 })}${suffix}`;
}

export function moneyOrDash(value: number | null | undefined) {
  return value == null ? "-" : money(value);
}

export function dateOrDash(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "-";
}

function formValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function formNumber(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? Number(trimmed) : null;
}

export async function loadDashboard(scope: "personal" | "smsf"): Promise<DashboardData> {
  const response = await fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load fundamentals");
  return payload as DashboardData;
}

export async function loadFundamentals(symbols?: string[]): Promise<MinerFundamentals[]> {
  const query = symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : "";
  const response = await fetch(`/api/fundamentals${query}`, { cache: "no-store" });
  const payload = await response.json() as FundamentalsResponse;
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load fundamentals ledger");
  return payload.fundamentals ?? [];
}

export async function loadFundamentalDrafts(): Promise<FundamentalResearchDraft[]> {
  const response = await fetch("/api/fundamentals/drafts?status=pending", { cache: "no-store" });
  const payload = await response.json() as DraftsResponse;
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load fundamentals drafts");
  return payload.drafts ?? [];
}

export async function acceptFundamentalDraft(id: string): Promise<MinerFundamentals> {
  const response = await fetch(`/api/fundamentals/drafts/${encodeURIComponent(id)}/accept`, { method: "POST", cache: "no-store" });
  const payload = await response.json() as DraftsResponse;
  if (!response.ok || payload.error || !payload.fundamental) throw new Error(payload.error || "Unable to accept fundamentals draft");
  return payload.fundamental;
}

export async function rejectFundamentalDraft(id: string, reviewNotes?: string): Promise<FundamentalResearchDraft> {
  const response = await fetch(`/api/fundamentals/drafts/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewNotes: reviewNotes?.trim() || null }),
    cache: "no-store",
  });
  const payload = await response.json() as DraftsResponse;
  if (!response.ok || payload.error || !payload.draft) throw new Error(payload.error || "Unable to reject fundamentals draft");
  return payload.draft;
}

export async function loadStarterFundamentals(): Promise<MinerFundamentals[]> {
  const response = await fetch("/api/fundamentals/starter", { method: "POST", cache: "no-store" });
  const payload = await response.json() as StarterResponse;
  if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load starter fundamentals");
  return payload.fundamentals ?? [];
}

export async function saveResearchFundamentals(form: ResearchFormState): Promise<MinerFundamentals> {
  const response = await fetch("/api/fundamentals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: form.symbol,
      name: formValue(form.name),
      primaryMetal: formValue(form.primaryMetal),
      jurisdiction: formValue(form.jurisdiction),
      projectStage: formValue(form.projectStage),
      productionOz: formNumber(form.productionOz),
      aiscUsdPerOz: formNumber(form.aiscUsdPerOz),
      resourceMoz: formNumber(form.resourceMoz),
      reserveMoz: formNumber(form.reserveMoz),
      cashAud: formNumber(form.cashAud),
      debtAud: formNumber(form.debtAud),
      marketCapAud: formNumber(form.marketCapAud),
      npvAud: formNumber(form.npvAud),
      capexAud: formNumber(form.capexAud),
      irrPercent: formNumber(form.irrPercent),
      jurisdictionScore: formNumber(form.jurisdictionScore),
      balanceSheetScore: formNumber(form.balanceSheetScore),
      dilutionScore: formNumber(form.dilutionScore),
      managementScore: formNumber(form.managementScore),
      sourceUrl: formValue(form.sourceUrl),
      asOfDate: formValue(form.asOfDate),
      notes: form.notes.trim(),
    }),
  });
  const payload = await response.json() as SaveFundamentalsResponse;
  if (!response.ok || payload.error || !payload.fundamental) throw new Error(payload.error || "Unable to save fundamentals");
  return payload.fundamental;
}
