import type { CompanyNewsItem } from "./types";

const YAHOO_HEADLINE_FEED = "https://feeds.finance.yahoo.com/rss/2.0/headline";
const TIMEOUT_MS = 12_000;

function tagValue(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return "";
  return match[1]
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Media coverage, used only where no issuer feed reaches the listing. Nothing here is ever marked
 * material: a headline records that a journalist thought something mattered, which is not the same
 * claim as an issuer declaring a release price-sensitive.
 */
export function parseYahooHeadlines(symbol: string, xml: string, limit = 8): CompanyNewsItem[] {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const news: CompanyNewsItem[] = [];
  for (const block of blocks.slice(0, limit)) {
    const headline = tagValue(block, "title");
    const url = tagValue(block, "link");
    const published = new Date(tagValue(block, "pubDate"));
    if (!headline || !url || Number.isNaN(published.getTime())) continue;
    news.push({
      symbol: symbol.toUpperCase(),
      headline,
      url,
      publishedAt: published.toISOString(),
      source: "Yahoo Finance",
      kind: "Media",
      material: false,
    });
  }
  return news;
}

export async function fetchYahooHeadlines(providerSymbol: string, symbol: string): Promise<CompanyNewsItem[]> {
  const url = `${YAHOO_HEADLINE_FEED}?s=${encodeURIComponent(providerSymbol)}&region=US&lang=en-US`;
  const response = await fetch(url, {
    headers: { "user-agent": "SouthernStar private portfolio research" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Yahoo headlines HTTP ${response.status}`);
  return parseYahooHeadlines(symbol, await response.text());
}
