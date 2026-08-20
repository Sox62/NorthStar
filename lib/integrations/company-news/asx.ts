import type { CompanyNewsItem } from "./types";

const ASX_ANNOUNCEMENTS_URL = "https://asx.api.markitdigital.com/asx-research/1.0/companies";
/** The announcement PDF itself. Verified to serve without any access token. */
const ASX_FILE_URL = "https://asx.api.markitdigital.com/asx-research/1.0/file";
const TIMEOUT_MS = 12_000;

type AsxAnnouncement = {
  announcementType?: string;
  date?: string;
  documentKey?: string;
  headline?: string;
  isPriceSensitive?: boolean;
};

export function asxDocumentUrl(documentKey: string) {
  return `${ASX_FILE_URL}/${encodeURIComponent(documentKey)}`;
}

/**
 * Normalises the announcement feed. `isPriceSensitive` is the whole point of this source: it is
 * the ASX's own market-sensitive flag, set by the company, so it says a release is material
 * without anyone having to infer it from a price move.
 */
export function parseAsxAnnouncements(symbol: string, payload: unknown): CompanyNewsItem[] {
  const items = (payload as { data?: { items?: AsxAnnouncement[] } } | null)?.data?.items;
  if (!Array.isArray(items)) return [];
  const news: CompanyNewsItem[] = [];
  for (const item of items) {
    if (!item?.headline || !item.documentKey || !item.date) continue;
    const published = new Date(item.date);
    if (Number.isNaN(published.getTime())) continue;
    news.push({
      symbol: symbol.toUpperCase(),
      headline: item.headline.trim(),
      url: asxDocumentUrl(item.documentKey),
      publishedAt: published.toISOString(),
      source: "ASX",
      kind: (item.announcementType ?? "").trim(),
      material: item.isPriceSensitive === true,
    });
  }
  return news;
}

export async function fetchAsxAnnouncements(symbol: string, count = 12): Promise<CompanyNewsItem[]> {
  const code = symbol.trim().toUpperCase();
  const url = `${ASX_ANNOUNCEMENTS_URL}/${encodeURIComponent(code)}/announcements?count=${count}&itemsPerPage=${count}`;
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "SouthernStar private portfolio research" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // A delisted or mistyped code 404s; that is an empty result, not a failure worth surfacing.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`ASX announcements HTTP ${response.status}`);
  return parseAsxAnnouncements(code, await response.json());
}
