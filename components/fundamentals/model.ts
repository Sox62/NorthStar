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
  message?: string;
  error?: string;
};

export type ResearchAiProvider = "none" | "openai" | "anthropic";

export type ResearchRequestState = {
  symbol: string;
  name: string;
  sourceUrl: string;
  aiProvider: ResearchAiProvider;
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

export const blankResearchRequest: ResearchRequestState = {
  symbol: "",
  name: "",
  sourceUrl: "",
  aiProvider: "none",
};

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


export const RESEARCH_TEMPLATE_SCHEMA = `{
  "symbol": "TICKER",
  "name": "Company name",
  "primaryMetal": "Primary commodity or theme",
  "jurisdiction": "Main operating jurisdiction(s)",
  "projectStage": "Producer | Developer | Explorer | Royalty | ETF | Other",
  "asOfDate": "YYYY-MM-DD",
  "productionOz": null,
  "aiscUsdPerOz": null,
  "resourceMoz": null,
  "reserveMoz": null,
  "cashAud": null,
  "debtAud": null,
  "marketCapAud": null,
  "npvAud": null,
  "capexAud": null,
  "irrPercent": null,
  "jurisdictionScore": null,
  "balanceSheetScore": null,
  "dilutionScore": null,
  "managementScore": null,
  "sourceUrl": "https://source-document-url",
  "notes": "Short factual summary only. Include source document names, source dates and uncertainty. Do not make buy/sell recommendations."
}`;

export function researchTemplatePrompt(form: Pick<ResearchFormState, "symbol" | "name">) {
  const symbol = form.symbol.trim().toUpperCase() || "TICKER";
  const name = form.name.trim() || "Company name";
  return `Research ${symbol} ${name} using current company filings, annual/quarterly reports, investor presentations and official market announcements. Return ONLY valid JSON matching this schema, replacing every placeholder with facts for the requested company. Use null where a value is not clearly sourced. Numeric money fields must be raw AUD numbers, not strings and not millions shorthand. Do not provide investment advice or buy/sell judgement. Do not invent scores. Put source URLs and source dates in notes.\n\n${RESEARCH_TEMPLATE_SCHEMA}`;
}

export function importResearchTemplateJson(current: ResearchFormState, rawJson: string): ResearchFormState {
  const parsed = parseResearchJson(rawJson);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Paste one JSON object from the research template");
  const source = parsed as Record<string, unknown>;
  const next = { ...current };

  setText(next, source, "symbol");
  next.symbol = next.symbol.toUpperCase();
  setText(next, source, "name");
  setText(next, source, "primaryMetal", "primary_metal", "metal");
  setText(next, source, "jurisdiction");
  setText(next, source, "projectStage", "project_stage", "stage");
  setDate(next, source, "asOfDate", "as_of_date", "asOf");
  setNumberText(next, source, "productionOz", "production_oz", "annualProductionOz");
  setNumberText(next, source, "aiscUsdPerOz", "aisc_usd_per_oz", "aisc");
  setNumberText(next, source, "resourceMoz", "resource_moz", "resourcesMoz");
  setNumberText(next, source, "reserveMoz", "reserve_moz", "reservesMoz");
  setNumberText(next, source, "cashAud", "cash_aud", "cash");
  setNumberText(next, source, "debtAud", "debt_aud", "debt");
  setNumberText(next, source, "marketCapAud", "market_cap_aud", "marketCap");
  setNumberText(next, source, "npvAud", "npv_aud", "npv");
  setNumberText(next, source, "capexAud", "capex_aud", "capex");
  setNumberText(next, source, "irrPercent", "irr_percent", "irr");
  setScoreText(next, source, "jurisdictionScore", "jurisdiction_score");
  setScoreText(next, source, "balanceSheetScore", "balance_sheet_score", "balanceScore");
  setScoreText(next, source, "dilutionScore", "dilution_score");
  setScoreText(next, source, "managementScore", "management_score");
  setText(next, source, "sourceUrl", "source_url");
  setText(next, source, "notes");

  if (!next.symbol.trim()) throw new Error("Imported research must include a symbol");
  return next;
}

function parseResearchJson(rawJson: string): unknown {
  const trimmed = rawJson.trim();
  if (!trimmed) throw new Error("Paste completed research JSON first");
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i) ?? trimmed.match(/(\{[\s\S]*\})/);
    if (!match) throw new Error("Research import must be valid JSON");
    return JSON.parse(match[1]);
  }
}

function firstValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (source[key] != null) return source[key];
  return undefined;
}

function setText(target: ResearchFormState, source: Record<string, unknown>, field: keyof ResearchFormState, ...aliases: string[]) {
  const value = firstValue(source, [field, ...aliases]);
  if (value == null) return;
  target[field] = String(value).trim();
}

function setDate(target: ResearchFormState, source: Record<string, unknown>, field: keyof ResearchFormState, ...aliases: string[]) {
  const value = firstValue(source, [field, ...aliases]);
  if (value == null || value === "") return;
  const text = String(value).trim();
  const iso = text.match(/^(20\d{2})-(\d{2})-(\d{2})/);
  target[field] = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : text;
}

function setNumberText(target: ResearchFormState, source: Record<string, unknown>, field: keyof ResearchFormState, ...aliases: string[]) {
  const value = firstValue(source, [field, ...aliases]);
  if (value == null || value === "") return;
  const number = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(number)) throw new Error(`${field} must be a number or null`);
  target[field] = String(number);
}

function setScoreText(target: ResearchFormState, source: Record<string, unknown>, field: keyof ResearchFormState, ...aliases: string[]) {
  const value = firstValue(source, [field, ...aliases]);
  if (value == null || value === "") return;
  const number = typeof value === "number" ? value : Number(String(value).replace(/\s/g, ""));
  if (!Number.isFinite(number) || number < 0 || number > 5) throw new Error(`${field} must be 0-5 or null`);
  target[field] = String(number);
}

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

export function researchFormForDraft(draft: FundamentalResearchDraft): ResearchFormState {
  return researchFormForIdea({
    symbol: draft.symbol,
    name: draft.name,
    primaryMetal: draft.primaryMetal,
    jurisdiction: draft.jurisdiction,
    projectStage: draft.projectStage,
    productionOz: draft.productionOz,
    aiscUsdPerOz: draft.aiscUsdPerOz,
    resourceMoz: draft.resourceMoz,
    reserveMoz: draft.reserveMoz,
    cashAud: draft.cashAud,
    debtAud: draft.debtAud,
    marketCapAud: draft.marketCapAud,
    npvAud: draft.npvAud,
    capexAud: draft.capexAud,
    irrPercent: draft.irrPercent,
    jurisdictionScore: draft.jurisdictionScore,
    balanceSheetScore: draft.balanceSheetScore,
    dilutionScore: draft.dilutionScore,
    managementScore: draft.managementScore,
    notes: [draft.notes, draft.sourceExcerpt ? "Source excerpt: " + draft.sourceExcerpt : null].filter(Boolean).join("\n\n"),
    sourceUrl: draft.sourceUrl,
    asOfDate: draft.asOfDate ?? draft.sourceDate,
    updatedAt: draft.createdAt,
  });
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

export async function requestFundamentalResearch(form: ResearchRequestState): Promise<{ draft: FundamentalResearchDraft; message: string }> {
  const response = await fetch("/api/fundamentals/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: form.symbol,
      name: formValue(form.name),
      sourceUrl: formValue(form.sourceUrl),
      aiProvider: form.aiProvider,
    }),
    cache: "no-store",
  });
  const payload = await response.json() as DraftsResponse;
  if (!response.ok || payload.error || !payload.draft) throw new Error(payload.error || "Unable to create fundamentals research draft");
  return { draft: payload.draft, message: payload.message ?? "Created factual research draft for " + payload.draft.symbol + "." };
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
