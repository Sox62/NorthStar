import type { FundamentalResearchDraftInput } from "@/lib/storage";
import { buildFundamentalResearchDraft, type FundamentalResearchSource } from "./research-draft";

export type FundamentalAiProvider = "none" | "openai" | "anthropic";

type AiFactPayload = Partial<Pick<FundamentalResearchDraftInput,
  "name" | "primaryMetal" | "jurisdiction" | "projectStage" | "productionOz" | "aiscUsdPerOz" | "resourceMoz" | "reserveMoz" |
  "cashAud" | "debtAud" | "marketCapAud" | "npvAud" | "capexAud" | "irrPercent" | "asOfDate" | "sourceDate"
>> & {
  notes?: string | null;
  sourceExcerpt?: string | null;
  confidence?: number | null;
};

const OPENAI_MODEL = process.env.OPENAI_FUNDAMENTALS_MODEL || "gpt-4.1-mini";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_FUNDAMENTALS_MODEL || "claude-3-5-haiku-latest";
const MAX_AI_SOURCE_CHARS = 80_000;

export async function buildAiFundamentalResearchDraft(source: FundamentalResearchSource, provider: FundamentalAiProvider): Promise<FundamentalResearchDraftInput> {
  if (provider === "none") return buildFundamentalResearchDraft(source);
  const sourceText = (source.sourceText ?? "").trim();
  if (!sourceText) throw new Error("AI extraction needs source text from an official document or supplied source URL.");

  const fallback = buildFundamentalResearchDraft(source);
  const payload = provider === "openai"
    ? await extractWithOpenAi(source, sourceText)
    : await extractWithAnthropic(source, sourceText);

  return {
    ...fallback,
    name: cleanText(payload.name) ?? fallback.name,
    primaryMetal: cleanText(payload.primaryMetal) ?? fallback.primaryMetal,
    jurisdiction: cleanText(payload.jurisdiction) ?? fallback.jurisdiction,
    projectStage: cleanText(payload.projectStage) ?? fallback.projectStage,
    productionOz: numberOrNull(payload.productionOz) ?? fallback.productionOz,
    aiscUsdPerOz: numberOrNull(payload.aiscUsdPerOz) ?? fallback.aiscUsdPerOz,
    resourceMoz: numberOrNull(payload.resourceMoz) ?? fallback.resourceMoz,
    reserveMoz: numberOrNull(payload.reserveMoz) ?? fallback.reserveMoz,
    cashAud: numberOrNull(payload.cashAud) ?? fallback.cashAud,
    debtAud: numberOrNull(payload.debtAud) ?? fallback.debtAud,
    marketCapAud: numberOrNull(payload.marketCapAud) ?? fallback.marketCapAud,
    npvAud: numberOrNull(payload.npvAud) ?? fallback.npvAud,
    capexAud: numberOrNull(payload.capexAud) ?? fallback.capexAud,
    irrPercent: numberOrNull(payload.irrPercent) ?? fallback.irrPercent,
    asOfDate: isoDateOrNull(payload.asOfDate) ?? fallback.asOfDate,
    sourceDate: isoDateOrNull(payload.sourceDate) ?? fallback.sourceDate,
    notes: [
      `AI factual extraction with ${provider}. Review every value against the source before accepting.`,
      cleanText(payload.notes),
      fallback.notes,
    ].filter(Boolean).join(" "),
    sourceExcerpt: cleanText(payload.sourceExcerpt) ?? fallback.sourceExcerpt,
    extractor: `${provider}-factual-extractor`,
    confidence: clampConfidence(payload.confidence) ?? fallback.confidence,
    reviewNotes: null,
  };
}

async function extractWithOpenAi(source: FundamentalResearchSource, sourceText: string): Promise<AiFactPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for ChatGPT extraction.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(source, sourceText) },
      ],
    }),
  });
  const body = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message || `OpenAI extraction failed with HTTP ${response.status}`);
  return parseAiJson(body?.choices?.[0]?.message?.content);
}

async function extractWithAnthropic(source: FundamentalResearchSource, sourceText: string): Promise<AiFactPayload> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured for Claude extraction.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1600,
      temperature: 0,
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt(source, sourceText) }],
    }),
  });
  const body = await response.json().catch(() => null) as { content?: Array<{ type?: string; text?: string }>; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message || `Anthropic extraction failed with HTTP ${response.status}`);
  return parseAiJson(body?.content?.find((part) => part.type === "text")?.text ?? body?.content?.[0]?.text);
}

function systemPrompt() {
  return [
    "You extract factual mining-company fundamentals from supplied source text only.",
    "Return JSON only. Do not give investment advice. Do not infer missing numeric facts.",
    "If a field is not explicitly supported by the source text, return null for that field.",
    "Every notes sentence must be factual and source-grounded, with no buy/sell/quality judgement.",
  ].join(" ");
}

function userPrompt(source: FundamentalResearchSource, sourceText: string) {
  return JSON.stringify({
    task: "Extract factual fields for a pending SouthernStar fundamentals draft.",
    symbol: source.symbol,
    companyNameHint: source.name ?? null,
    sourceUrl: source.sourceUrl ?? null,
    sourceTitle: source.sourceTitle ?? null,
    requiredJsonShape: {
      name: "string|null",
      primaryMetal: "string|null",
      jurisdiction: "string|null",
      projectStage: "Producer|Developer|Explorer|ETF|null",
      productionOz: "number|null annual gold/silver equivalent ounces only",
      aiscUsdPerOz: "number|null",
      resourceMoz: "number|null total reported million ounces only",
      reserveMoz: "number|null total reported million ounces only",
      cashAud: "number|null AUD equivalent if explicitly stated or clearly A$/AUD",
      debtAud: "number|null AUD equivalent if explicitly stated or clearly A$/AUD",
      marketCapAud: "number|null AUD equivalent if explicitly stated or clearly A$/AUD",
      npvAud: "number|null AUD equivalent if explicitly stated or clearly A$/AUD",
      capexAud: "number|null AUD equivalent if explicitly stated or clearly A$/AUD",
      irrPercent: "number|null",
      asOfDate: "YYYY-MM-DD|null",
      sourceDate: "YYYY-MM-DD|null",
      sourceExcerpt: "one short source excerpt supporting the most important extracted numeric facts|null",
      notes: "short factual summary of what was extracted and what remained unavailable|null",
      confidence: "number 0..1 based only on source support",
    },
    sourceText: sourceText.slice(0, MAX_AI_SOURCE_CHARS),
  });
}

export function parseAiJson(raw: string | null | undefined): AiFactPayload {
  if (!raw?.trim()) throw new Error("AI extraction returned no JSON.");
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  const jsonText = fenced ?? trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
  const parsed = JSON.parse(jsonText) as AiFactPayload;
  return parsed && typeof parsed === "object" ? parsed : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 2000) : null;
}

function numberOrNull(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(/,/g, "")) : NaN;
  return Number.isFinite(number) ? number : null;
}

function isoDateOrNull(value: unknown) {
  const text = cleanText(value);
  return text && /^20\d{2}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function clampConfidence(value: unknown) {
  const number = numberOrNull(value);
  return number == null ? null : Math.max(0, Math.min(1, number));
}
