import type { CompanyNewsItem } from "@/lib/integrations/company-news";

const TIMEOUT_MS = 12_000;
const MAX_RESULTS = 10;

type WebSearchProvider = "brave" | "tavily";

type SearchRequest = {
  symbol: string;
  name?: string | null;
};

export async function fetchFundamentalWebCandidates(request: SearchRequest): Promise<CompanyNewsItem[]> {
  const provider = configuredProvider();
  if (!provider) return [];
  const query = buildFundamentalsQuery(request);
  return provider === "brave" ? fetchBraveCandidates(request.symbol, query) : fetchTavilyCandidates(request.symbol, query);
}

function configuredProvider(): WebSearchProvider | null {
  if (process.env.BRAVE_SEARCH_API_KEY?.trim()) return "brave";
  if (process.env.TAVILY_API_KEY?.trim()) return "tavily";
  return null;
}

function buildFundamentalsQuery(request: SearchRequest) {
  const identity = [request.name, request.symbol].filter(Boolean).join(" ");
  return `${identity} investor presentation annual report quarterly report facts AISC cash resources reserves PDF`;
}

async function fetchBraveCandidates(symbol: string, query: string): Promise<CompanyNewsItem[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(MAX_RESULTS));
  url.searchParams.set("search_lang", "en");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY?.trim() ?? "",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Brave search HTTP ${response.status}`);
  const payload = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> } };
  return normaliseSearchResults(symbol, payload.web?.results ?? []);
}

async function fetchTavilyCandidates(symbol: string, query: string): Promise<CompanyNewsItem[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY?.trim(),
      query,
      search_depth: "basic",
      max_results: MAX_RESULTS,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Tavily search HTTP ${response.status}`);
  const payload = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> };
  return normaliseSearchResults(symbol, payload.results ?? []);
}

function normaliseSearchResults(symbol: string, results: Array<{ title?: string; url?: string; description?: string; content?: string; age?: string; published_date?: string }>) {
  const today = new Date().toISOString();
  const seen = new Set<string>();
  return results.flatMap((result) => {
    const url = result.url?.trim();
    const title = result.title?.trim();
    if (!url || !title || seen.has(url)) return [];
    seen.add(url);
    return [{
      symbol: symbol.trim().toUpperCase(),
      headline: title,
      url,
      publishedAt: dateOrToday(result.published_date || result.age) ?? today,
      source: "Web Search" as const,
      kind: result.description || result.content || "search result",
      material: false,
    }];
  });
}

function dateOrToday(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
