export type CompanyNewsSource = "ASX" | "SEC" | "Yahoo Finance" | "Web Search";

export type CompanyNewsItem = {
  symbol: string;
  headline: string;
  url: string;
  /** ISO timestamp. Sorting and the recency window both depend on this being comparable. */
  publishedAt: string;
  source: CompanyNewsSource;
  /** The issuer's own label: an ASX announcement type, or an SEC form number. */
  kind: string;
  /**
   * Whether the issuer itself declared this material — the ASX price-sensitive flag, or a form the
   * SEC reserves for material events. Media coverage is never material: a headline is somebody's
   * opinion that something mattered, which is a different claim.
   */
  material: boolean;
};

export type NewsVenue = "asx" | "sec" | "yahoo";

const ASX_EXCHANGES = new Set(["ASX", "AU", "AUS", "AUSTRALIA"]);
const SEC_EXCHANGES = new Set(["NYSE", "NASDAQ", "AMEX", "ARCA", "NYSEARCA", "NYSEAMERICAN", "BATS", "US", "USA"]);
const CANADIAN_EXCHANGES = new Set(["TSX", "TSXV", "TSE", "CVE", "CA", "CANADA", "TSX/TSXV"]);

/**
 * Which provider can speak for this listing.
 *
 * Canadian listings route to the SEC because most of the book's Canadian miners are also SEC
 * filers — SVM, UUUU and WRN all are — and a 6-K is a real company release where a media headline
 * is not. SEDAR+ would be the native source but publishes no usable public API, so a Canadian
 * issuer that does not file in the US falls through to headlines. The caller resolves that by
 * asking for a CIK first and falling back when there is none.
 */
export function isUsVenue(exchange: string) {
  return SEC_EXCHANGES.has(exchange.trim().toUpperCase());
}

export function newsVenueForExchange(exchange: string): NewsVenue {
  const value = exchange.trim().toUpperCase();
  if (ASX_EXCHANGES.has(value)) return "asx";
  if (SEC_EXCHANGES.has(value)) return "sec";
  if (CANADIAN_EXCHANGES.has(value)) return "sec";
  return "yahoo";
}

/**
 * Sorted newest first, capped, and stripped of anything undated or unlinked.
 *
 * Material releases inside the window are kept even when newer routine filings would crowd them
 * out. A busy SEC filer can post eight Form 4s and a Schedule 13G/A in a fortnight, which would
 * push a real 8-K past a plain cap and silently take the badge with it.
 */
export function orderNews(items: CompanyNewsItem[], limit = 8, windowDays = 14, now = new Date()): CompanyNewsItem[] {
  const usable = items
    .filter((item) => item.headline && item.url && item.publishedAt)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));

  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const kept = usable.filter((item) => item.material && item.publishedAt >= cutoff);
  for (const item of usable) {
    if (kept.length >= limit) break;
    if (!kept.includes(item)) kept.push(item);
  }
  return kept.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

/**
 * Whether an SEC filer plausibly *is* the holding, by shared name token.
 *
 * A CIK is looked up by ticker, which is only authoritative for a US listing. "XYZ" on the TSX and
 * "XYZ" on Nasdaq can be unrelated companies, so a Canadian listing that resolves to a filer with
 * nothing in common with the held name is a collision, not a match, and falls back to headlines.
 *
 * Three-letter tokens count, because tickers-as-names are exactly the risky case: "MAG Silver"
 * against "Magnachip Semiconductor" only disagrees once "mag" is allowed to be a word. Where a
 * name is nothing but industry filler — "Gold Mining Corp" — the guard abstains rather than guess,
 * on the view that showing the filings is a smaller error than hiding them.
 */
export function issuerNamesAgree(holdingName: string, filerName: string) {
  if (!holdingName.trim() || !filerName.trim()) return true;
  const tokens = (value: string) => new Set(
    value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
  );
  const held = tokens(holdingName);
  if (!held.size) return true;
  const filer = tokens(filerName);
  for (const word of held) if (filer.has(word)) return true;
  return false;
}

const STOP_WORDS = new Set([
  "corp", "corporation", "limited", "inc", "incorporated", "company", "group", "holdings",
  "resources", "mining", "mines", "metals", "gold", "silver", "copper", "energy", "royalty",
  "residual", "ordinary", "shares", "class", "trust", "fund",
]);

/**
 * Whether a symbol should carry a badge: a material release inside the window. Routine filings
 * still reach the list, they just do not raise a flag — a badge that lights up for a change of
 * director's interest notice teaches you to ignore badges.
 */
export function hasMaterialNews(items: CompanyNewsItem[], windowDays = 14, now = new Date()): boolean {
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  return items.some((item) => item.material && item.publishedAt >= cutoff);
}
