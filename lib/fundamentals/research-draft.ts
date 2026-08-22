import type { FundamentalResearchDraftInput } from "@/lib/storage";

export type FundamentalResearchSource = {
  symbol: string;
  name?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceText?: string | null;
};

const MAX_SOURCE_CHARS = 300_000;
const EXTRACTOR = "southernstar-factual-parser";

const privateHosts = [/^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^0\.0\.0\.0$/, /^::1$/, /\.local$/i];

export function normaliseResearchSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\s+/g, "").slice(0, 20);
}

export function validateResearchSourceUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Research source must be an http or https URL");
  if (privateHosts.some((pattern) => pattern.test(url.hostname))) throw new Error("Research source cannot point to a private or local host");
  const ipv4 = url.hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const first = Number(ipv4[1]);
    const second = Number(ipv4[2]);
    if (first === 172 && second >= 16 && second <= 31) throw new Error("Research source cannot point to a private host");
  }
  return url;
}

export async function fetchResearchSource(rawUrl: string) {
  const url = validateResearchSourceUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SouthernStar/0.3 fundamentals research draft" },
    });
    if (!response.ok) throw new Error(`Research source returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text|html|json|xml|csv/i.test(contentType)) throw new Error("Research source must be readable text, HTML, JSON, XML or CSV");
    const body = (await response.text()).slice(0, MAX_SOURCE_CHARS);
    return { text: body, title: extractTitle(body) ?? url.hostname };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildFundamentalResearchDraft(source: FundamentalResearchSource): FundamentalResearchDraftInput {
  const symbol = normaliseResearchSymbol(source.symbol);
  if (!symbol) throw new Error("Ticker is required");

  const plainText = htmlToText(source.sourceText ?? "");
  const extracted = extractFacts(plainText);
  const extractedLabels = Object.entries(extracted)
    .filter(([, value]) => value != null)
    .map(([key]) => key);
  const hasSource = Boolean(source.sourceUrl || plainText);
  const sourceTitle = source.sourceTitle || extractTitle(source.sourceText ?? "") || null;
  const notes = [
    hasSource
      ? `Draft created from source text for ${symbol}. Review every field before accepting; no judgement scores were assigned.`
      : `Research requested for ${symbol}. Add a source URL or paste sourced facts before accepting.`,
    extractedLabels.length ? `Auto-extracted: ${extractedLabels.join(", ")}.` : "No numeric fundamentals were auto-extracted.",
  ].join(" ");

  return {
    symbol,
    name: cleanNullable(source.name),
    primaryMetal: null,
    jurisdiction: null,
    projectStage: null,
    productionOz: extracted.productionOz,
    aiscUsdPerOz: extracted.aiscUsdPerOz,
    resourceMoz: extracted.resourceMoz,
    reserveMoz: extracted.reserveMoz,
    cashAud: extracted.cashAud,
    debtAud: extracted.debtAud,
    marketCapAud: extracted.marketCapAud,
    npvAud: extracted.npvAud,
    capexAud: extracted.capexAud,
    irrPercent: extracted.irrPercent,
    jurisdictionScore: null,
    balanceSheetScore: null,
    dilutionScore: null,
    managementScore: null,
    notes,
    sourceUrl: cleanNullable(source.sourceUrl),
    asOfDate: extractIsoDate(plainText),
    sourceTitle,
    sourceDate: extractIsoDate(plainText),
    sourceExcerpt: makeSourceExcerpt(plainText),
    extractor: EXTRACTOR,
    confidence: confidenceFor(hasSource, extractedLabels.length),
    reviewNotes: null,
  };
}

function cleanNullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function confidenceFor(hasSource: boolean, extractedCount: number) {
  if (!hasSource) return 0;
  if (extractedCount >= 4) return 0.45;
  if (extractedCount >= 1) return 0.3;
  return 0.1;
}

function htmlToText(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(input: string) {
  const match = input.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 160) : null;
}

function makeSourceExcerpt(text: string) {
  if (!text) return null;
  return text.slice(0, 900);
}

function extractIsoDate(text: string) {
  const iso = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const named = text.match(/\b([0-3]?\d)\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i);
  if (!named) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
  return `${named[3]}-${String(month).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
}

type ExtractedFacts = Pick<FundamentalResearchDraftInput,
  "productionOz" | "aiscUsdPerOz" | "resourceMoz" | "reserveMoz" | "cashAud" | "debtAud" | "marketCapAud" | "npvAud" | "capexAud" | "irrPercent"
>;

function extractFacts(text: string): ExtractedFacts {
  return {
    productionOz: extractOunceQuantity(text, /(?:production|produced)[\s\S]{0,120}/i),
    aiscUsdPerOz: extractNumberNear(text, /(?:AISC|all[- ]in sustaining cost)[\s\S]{0,120}?(?:US\$|USD|\$)\s*([0-9][0-9,]*(?:\.\d+)?)/i),
    resourceMoz: extractMozNear(text, /(?:mineral\s+)?resources?[\s\S]{0,140}/i),
    reserveMoz: extractMozNear(text, /(?:ore\s+)?reserves?[\s\S]{0,140}/i),
    cashAud: extractCurrencyAmount(text, /(?:cash(?: and cash equivalents)?|cash balance|cash at bank)[\s\S]{0,120}/i),
    debtAud: extractCurrencyAmount(text, /(?:debt|borrowings)[\s\S]{0,120}/i),
    marketCapAud: extractCurrencyAmount(text, /(?:market capitalisation|market capitalization|market cap)[\s\S]{0,120}/i),
    npvAud: extractCurrencyAmount(text, /(?:NPV|net present value)[\s\S]{0,120}/i),
    capexAud: extractCurrencyAmount(text, /(?:capex|capital cost|development capital)[\s\S]{0,120}/i),
    irrPercent: extractNumberNear(text, /(?:IRR|internal rate of return)[\s\S]{0,80}?([0-9][0-9,]*(?:\.\d+)?)\s*%/i),
  };
}

function extractSegment(text: string, prefix: RegExp) {
  return text.match(prefix)?.[0] ?? "";
}

function extractCurrencyAmount(text: string, prefix: RegExp) {
  const segment = extractSegment(text, prefix);
  const match = segment.match(/(?:A\$|AUD|US\$|USD|C\$|CAD|\$)?\s*([0-9][0-9,]*(?:\.\d+)?)\s*(m|million|b|bn|billion)?/i);
  return match ? magnitude(Number(match[1].replace(/,/g, "")), match[2]) : null;
}

function extractMozNear(text: string, prefix: RegExp) {
  const segment = extractSegment(text, prefix);
  const match = segment.match(/([0-9][0-9,]*(?:\.\d+)?)\s*(Moz|million\s+ounces|m\s+ounces)/i);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function extractOunceQuantity(text: string, prefix: RegExp) {
  const segment = extractSegment(text, prefix);
  const match = segment.match(/([0-9][0-9,]*(?:\.\d+)?)\s*(Moz|million\s+ounces|m\s+ounces|oz|ounces)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return /moz|million|m\s+ounces/i.test(match[2]) ? value * 1_000_000 : value;
}

function extractNumberNear(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function magnitude(value: number, unit: string | undefined) {
  if (!unit) return value;
  if (/^b|bn|billion/i.test(unit)) return value * 1_000_000_000;
  if (/^m|million/i.test(unit)) return value * 1_000_000;
  return value;
}
