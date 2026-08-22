import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { buildAiFundamentalResearchDraft } from "@/lib/fundamentals/ai-extractor";
import { asxIssuerMismatch, buildFundamentalResearchDraft, fetchResearchSource, fundamentalSourceFactYield, type FundamentalResearchSource } from "@/lib/fundamentals/research-draft";
import { fetchFundamentalWebCandidates } from "@/lib/fundamentals/web-search";
import { fetchAsxAnnouncements, fetchCompanyNews, type CompanyNewsItem, type NewsInstrument } from "@/lib/integrations/company-news";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const researchRequestSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  name: z.preprocess((value) => value === "" || value === undefined ? null : value, z.string().trim().nullable()),
  sourceUrl: z.preprocess((value) => value === "" || value === undefined ? null : value, z.string().url().nullable()),
  aiProvider: z.enum(["none", "openai", "anthropic"]).default("none"),
});

const FUNDAMENTAL_SOURCE_SCORE: Array<[RegExp, number]> = [
  [/annual\s+report|annual\s+results|10-k|20-f|40-f/i, 140],
  [/quarterly|half[- ]year|interim|appendix\s+5b|appendix\s+4c/i, 110],
  [/financial\s+results|results\s+of\s+operations|cash\s+flow|cashflow/i, 105],
  [/resource|reserve|mineral\s+resource|ore\s+reserve|maiden/i, 85],
  [/feasibility|scoping|pfs|dfs|study|npv|capex|irr/i, 80],
  [/presentation|investor/i, 55],
];

const LOW_VALUE_SOURCE_SCORE: Array<[RegExp, number]> = [
  [/acquisition|binding agreement|cleansing notice|change of director|application for quotation/i, 50],
  [/appendix\s+3|appendix\s+2a|notice of meeting|becoming a substantial holder/i, 80],
];

const MAX_SOURCE_CANDIDATES = 12;

type DiscoveredResearchSource = {
  item: CompanyNewsItem | null;
  note: string | null;
  source: Awaited<ReturnType<typeof fetchResearchSource>> | null;
};

async function discoverResearchSource(symbol: string, name: string | null): Promise<DiscoveredResearchSource> {
  const instruments = candidateInstruments(symbol, name);
  const failures: string[] = [];

  for (const instrument of instruments) {
    try {
      const items = chooseResearchSources(await fetchResearchCandidates(instrument));
      let best: { item: CompanyNewsItem; source: Awaited<ReturnType<typeof fetchResearchSource>>; score: number } | null = null;

      for (const item of items.slice(0, MAX_SOURCE_CANDIDATES)) {
        try {
          const source = await fetchResearchSource(item.url);
          const issuer = item.source === "ASX" ? asxIssuerMismatch(instrument.symbol, source.text) : null;
          if (issuer) {
            failures.push(`${instrument.symbol}:${instrument.exchange} skipped ${item.headline} because the PDF header is ASX:${issuer}`);
            continue;
          }
          const score = sourceScore(item) + fundamentalSourceFactYield(source.text);
          if (!best || score > best.score || score === best.score && item.publishedAt > best.item.publishedAt) {
            best = { item, source, score };
          }
        } catch (error) {
          failures.push(`${instrument.symbol}:${instrument.exchange} ${item.headline} ${error instanceof Error ? error.message : "source failed"}`);
        }
      }

      if (best) {
        return {
          item: best.item,
          source: best.source,
          note: `Source discovered from ${best.item.source} using ${instrument.symbol}:${instrument.exchange}; selected for highest fundamentals yield from ${Math.min(items.length, MAX_SOURCE_CANDIDATES)} candidates.`,
        };
      }
    } catch (error) {
      failures.push(`${instrument.symbol}:${instrument.exchange} ${error instanceof Error ? error.message : "lookup failed"}`);
    }
  }

  return { item: null, source: null, note: failures.length ? `No official filing source found. Lookup warnings: ${failures.join("; ")}.` : "No official filing source found." };
}

function candidateInstruments(rawSymbol: string, name: string | null): NewsInstrument[] {
  const symbol = rawSymbol.trim().toUpperCase();
  const withoutSuffix = symbol.replace(/\.(AX|AU|ASX|TO|V|TSX|TSXV|NYSE|NASDAQ|AMEX|ARCA)$/i, "");
  const explicit = explicitExchange(symbol);
  const candidates: NewsInstrument[] = explicit
    ? [{ symbol: withoutSuffix, exchange: explicit, name: name ?? undefined }]
    : [
      { symbol: withoutSuffix, exchange: "ASX", name: name ?? undefined },
      { symbol: withoutSuffix, exchange: "NYSE", name: name ?? undefined },
      { symbol: withoutSuffix, exchange: "NASDAQ", name: name ?? undefined },
      { symbol: withoutSuffix, exchange: "AMEX", name: name ?? undefined },
      { symbol: withoutSuffix, exchange: "TSX", name: name ?? undefined },
      { symbol: withoutSuffix, exchange: "TSXV", name: name ?? undefined },
    ];

  const seen = new Set<string>();
  return candidates.filter((instrument) => {
    const key = `${instrument.symbol}:${instrument.exchange}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function explicitExchange(symbol: string) {
  if (/\.(AX|AU|ASX)$/i.test(symbol)) return "ASX";
  if (/\.TO$/i.test(symbol)) return "TSX";
  if (/\.V$/i.test(symbol)) return "TSXV";
  if (/\.(NYSE|NASDAQ|AMEX|ARCA)$/i.test(symbol)) return symbol.split(".").at(-1)?.toUpperCase() ?? null;
  return null;
}

async function fetchResearchCandidates(instrument: NewsInstrument) {
  const symbol = instrument.symbol.trim().toUpperCase();
  const webCandidates = await fetchFundamentalWebCandidates({ symbol, name: instrument.name });
  if (instrument.exchange.trim().toUpperCase() === "ASX") {
    const announcements = await fetchAsxAnnouncements(symbol, 80);
    if (announcements.length || webCandidates.length) return [...webCandidates, ...announcements];
  }
  return [...webCandidates, ...await fetchCompanyNews(instrument)];
}

function chooseResearchSources(items: CompanyNewsItem[]) {
  return [...items]
    .filter((item) => item.url && item.headline)
    .sort((left, right) => sourceScore(right) - sourceScore(left) || right.publishedAt.localeCompare(left.publishedAt));
}

async function buildDraftWithProviderFallback(source: FundamentalResearchSource, provider: "none" | "openai" | "anthropic") {
  if (provider === "none") return { draftInput: buildFundamentalResearchDraft(source), extractionWarning: "" };
  try {
    return { draftInput: await buildAiFundamentalResearchDraft(source, provider), extractionWarning: "" };
  } catch (error) {
    const fallback = buildFundamentalResearchDraft(source);
    const message = error instanceof Error ? error.message : "AI extraction failed";
    return {
      draftInput: {
        ...fallback,
        notes: [
          `${provider === "anthropic" ? "Claude" : "ChatGPT"} extraction failed: ${message}.`,
          fallback.notes,
        ].filter(Boolean).join(" "),
        extractor: `${provider}-fallback-factual-parser`,
        reviewNotes: message,
      },
      extractionWarning: `AI extraction failed; saved a source draft for manual review.`,
    };
  }
}

function sourceScore(item: CompanyNewsItem) {
  const text = `${item.headline} ${item.kind}`;
  const matchScore = FUNDAMENTAL_SOURCE_SCORE.reduce((score, [pattern, value]) => pattern.test(text) ? Math.max(score, value) : score, 0);
  const official = item.source === "ASX" || item.source === "SEC" ? 30 : 0;
  const material = item.material ? 10 : 0;
  const penalty = LOW_VALUE_SOURCE_SCORE.reduce((score, [pattern, value]) => pattern.test(text) ? Math.max(score, value) : score, 0);
  return official + material + matchScore - penalty;
}

export async function POST(request: Request) {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(sessionCookie).catch(() => null);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const input = researchRequestSchema.parse(await request.json());
    const discovered = input.sourceUrl ? { item: null, note: "Source URL supplied by user.", source: null } : await discoverResearchSource(input.symbol, input.name);
    const sourceUrl = input.sourceUrl ?? discovered.item?.url ?? null;
    const source = input.sourceUrl ? await fetchResearchSource(input.sourceUrl) : discovered.source ?? { text: "", title: null };
    const researchSource: FundamentalResearchSource = {
      symbol: input.symbol,
      name: input.name,
      sourceUrl,
      sourceTitle: discovered.item?.headline ?? source.title ?? null,
      sourceText: source.text,
      discoveryNote: discovered.note,
    };
    const { draftInput, extractionWarning } = await buildDraftWithProviderFallback(researchSource, input.aiProvider);
    const draft = await getStorage().createFundamentalResearchDraft(draftInput);
    const baseMessage = draft.sourceUrl ? `Created factual research draft for ${draft.symbol} from ${draft.sourceTitle ?? "discovered source"}.` : `Created source-needed research draft for ${draft.symbol}.`;
    return NextResponse.json({ draft, message: extractionWarning ? `${baseMessage} ${extractionWarning}` : baseMessage }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create fundamentals research draft" },
      { status: 400 },
    );
  }
}
