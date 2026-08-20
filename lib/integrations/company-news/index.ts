import { yahooSuffixes } from "../market-data";
import { fetchAsxAnnouncements } from "./asx";
import { fetchSecFilings } from "./sec";
import { fetchYahooHeadlines } from "./yahoo";
import { isUsVenue, newsVenueForExchange, orderNews, type CompanyNewsItem } from "./types";

export * from "./types";
export { asxDocumentUrl, parseAsxAnnouncements } from "./asx";
export { describe8kItems, isMaterialSecForm, isOwnershipSecForm, parseSecFilings, parseTickerMap, secDocumentUrl } from "./sec";
export { parseYahooHeadlines } from "./yahoo";

export type NewsInstrument = { symbol: string; exchange: string; name?: string };

/** Yahoo needs a venue suffix — MAG on Toronto is MAG.TO — and only the first candidate is used. */
export function yahooNewsSymbol(instrument: NewsInstrument) {
  const symbol = instrument.symbol.trim().toUpperCase();
  const suffix = yahooSuffixes(instrument.exchange)[0] ?? "";
  return suffix ? `${symbol}.${suffix}` : symbol;
}

/**
 * The issuer's own feed where one reaches the listing, media headlines where none does.
 *
 * The fallback is deliberate rather than a safety net: a Canadian issuer that does not file with
 * the SEC has no machine-readable release feed at all — SEDAR+ publishes no usable public API —
 * so headlines are the only thing left, and they are marked as media so nothing pretends
 * otherwise.
 */
export async function fetchCompanyNews(instrument: NewsInstrument): Promise<CompanyNewsItem[]> {
  const symbol = instrument.symbol.trim().toUpperCase();
  const venue = newsVenueForExchange(instrument.exchange);

  if (venue === "asx") {
    const announcements = await fetchAsxAnnouncements(symbol);
    if (announcements.length) return orderNews(announcements);
    return orderNews(await fetchYahooHeadlines(yahooNewsSymbol(instrument), symbol));
  }

  if (venue === "sec") {
    // On a US listing the ticker is the SEC's own key, so no name check is needed or wanted.
    const filings = await fetchSecFilings(symbol, isUsVenue(instrument.exchange) ? undefined : instrument.name);
    if (filings) return orderNews(filings);
  }

  return orderNews(await fetchYahooHeadlines(yahooNewsSymbol(instrument), symbol));
}

const CACHE_TTL_MS = 15 * 60 * 1000;
/** EDGAR's fair-access policy caps requests, and a book of thirty names would otherwise burst. */
const CONCURRENCY = 4;

const cache = new Map<string, { items: CompanyNewsItem[]; fetchedAt: number }>();

function cacheKey(instrument: NewsInstrument) {
  return `${instrument.symbol.trim().toUpperCase()}:${instrument.exchange.trim().toUpperCase()}`;
}

export type CompanyNewsBatch = {
  bySymbol: Record<string, CompanyNewsItem[]>;
  errors: string[];
};

/** Fetches a whole book, cached per symbol, with one failing name never sinking the rest. */
export async function fetchCompanyNewsBatch(instruments: NewsInstrument[]): Promise<CompanyNewsBatch> {
  const bySymbol: Record<string, CompanyNewsItem[]> = {};
  const errors: string[] = [];
  const pending: NewsInstrument[] = [];

  for (const instrument of instruments) {
    const cached = cache.get(cacheKey(instrument));
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      bySymbol[instrument.symbol.trim().toUpperCase()] = cached.items;
      continue;
    }
    pending.push(instrument);
  }

  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const instrument = pending[cursor];
      cursor += 1;
      const symbol = instrument.symbol.trim().toUpperCase();
      try {
        const items = await fetchCompanyNews(instrument);
        cache.set(cacheKey(instrument), { items, fetchedAt: Date.now() });
        bySymbol[symbol] = items;
      } catch (error) {
        bySymbol[symbol] = [];
        errors.push(`${symbol}: ${error instanceof Error ? error.message : "news lookup failed"}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  return { bySymbol, errors };
}
