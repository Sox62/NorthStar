import { issuerNamesAgree, type CompanyNewsItem } from "./types";

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions";
const SEC_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data";
const TIMEOUT_MS = 15_000;

/**
 * EDGAR's fair-access policy requires a declared identity on every request, and answers 403 to
 * anything anonymous. This is the one provider here with a documented contract, which is also why
 * it is the one that will not quietly disappear the way the old ASX endpoint did.
 */
const SEC_HEADERS = {
  "user-agent": "SouthernStar private portfolio research stephenox@me.com",
  accept: "application/json",
};

/**
 * Forms the SEC reserves for material events: 8-K from a domestic filer, 6-K from a foreign
 * private issuer. Amendments (8-K/A) count. An annual report on 40-F or 20-F is a scheduled
 * document, not an event, so it is listed but never flagged.
 */
const MATERIAL_FORMS = /^(8-K|6-K)(\/A)?$/i;

export function isMaterialSecForm(form: string) {
  return MATERIAL_FORMS.test(form.trim());
}

/**
 * Insider and beneficial-ownership reports. A large filer posts these constantly — Newmont's most
 * recent filings were three Form 4s deep — and none of them is news about the company: they record
 * who bought or sold stock, not anything the business did.
 */
const OWNERSHIP_FORMS = /^(3|4|5|144|SC 13[GD]|SC 13[GD]\/A)(\/A)?$/i;

export function isOwnershipSecForm(form: string) {
  return OWNERSHIP_FORMS.test(form.trim());
}

export function secDocumentUrl(cik: number, accessionNumber: string, primaryDocument: string) {
  const accession = accessionNumber.replace(/-/g, "");
  if (!primaryDocument) return `${SEC_ARCHIVES_URL}/${cik}/${accession}`;
  return `${SEC_ARCHIVES_URL}/${cik}/${accession}/${primaryDocument}`;
}

/**
 * What an 8-K is actually about. EDGAR's description field is usually just "FORM 8-K", but the
 * item codes say which event triggered the filing, and those are the difference between a list of
 * form numbers and something worth reading.
 */
const SEC_8K_ITEMS: Record<string, string> = {
  "1.01": "Entered a material agreement",
  "1.02": "Terminated a material agreement",
  "1.03": "Bankruptcy or receivership",
  "2.01": "Completed an acquisition or disposal",
  "2.02": "Results of operations and financial condition",
  "2.03": "Created a direct financial obligation",
  "2.04": "Triggering event accelerating an obligation",
  "2.05": "Exit or disposal costs",
  "2.06": "Material impairment",
  "3.01": "Delisting notice or listing-rule failure",
  "3.02": "Unregistered sale of equity securities",
  "3.03": "Modified security holder rights",
  "4.01": "Changed certifying accountant",
  "4.02": "Non-reliance on previously issued financials",
  "5.01": "Change in control",
  "5.02": "Director or officer change",
  "5.03": "Amended articles or changed fiscal year",
  "5.07": "Shareholder vote results",
  "7.01": "Regulation FD disclosure",
  "8.01": "Other events",
};

/**
 * Codes that accompany a filing rather than explain it: exhibits are always attached, and an FD
 * disclosure or "other events" is a wrapper. They are used only when nothing better is present.
 */
const ANCILLARY_8K_ITEMS = new Set(["9.01", "7.01", "8.01"]);

export function describe8kItems(items: string): string {
  const codes = items.split(",").map((code) => code.trim()).filter(Boolean);
  const preferred = codes.find((code) => SEC_8K_ITEMS[code] && !ANCILLARY_8K_ITEMS.has(code));
  const fallback = codes.find((code) => SEC_8K_ITEMS[code]);
  const chosen = preferred ?? fallback;
  return chosen ? SEC_8K_ITEMS[chosen] : "";
}

type SecSubmissions = {
  name?: string;
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      accessionNumber?: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
      items?: string[];
    };
  };
};

/**
 * EDGAR returns filings as parallel arrays, so every field is read by index off `form`. The limit
 * is generous because ordering trims the list afterwards: a filer can bury an 8-K under a fortnight
 * of Form 4s, and a short scan here would never see it.
 */
export function parseSecFilings(symbol: string, cik: number, payload: unknown, limit = 40): CompanyNewsItem[] {
  const recent = (payload as SecSubmissions | null)?.filings?.recent;
  if (!recent?.form) return [];
  const news: CompanyNewsItem[] = [];
  for (let index = 0; index < recent.form.length && news.length < limit; index += 1) {
    const form = recent.form[index];
    const filingDate = recent.filingDate?.[index];
    const accession = recent.accessionNumber?.[index];
    if (!form || !filingDate || !accession) continue;
    if (isOwnershipSecForm(form)) continue;
    const description = recent.primaryDocDescription?.[index]?.trim();
    // The description is often just "FORM 8-K", which tells the reader nothing they cannot see,
    // so the 8-K item codes are preferred wherever they resolve to a real event.
    const event = describe8kItems(recent.items?.[index] ?? "");
    const useful = description && !/^form\s/i.test(description) ? description : "";
    const headline = event || useful || `${form} filing`;
    news.push({
      symbol: symbol.toUpperCase(),
      headline,
      url: secDocumentUrl(cik, accession, recent.primaryDocument?.[index] ?? ""),
      publishedAt: new Date(`${filingDate}T00:00:00Z`).toISOString(),
      source: "SEC",
      kind: form,
      material: isMaterialSecForm(form),
    });
  }
  return news;
}

type TickerRow = { cik_str?: number; ticker?: string };

export function parseTickerMap(payload: unknown): Map<string, number> {
  const map = new Map<string, number>();
  const rows = payload && typeof payload === "object" ? Object.values(payload as Record<string, TickerRow>) : [];
  for (const row of rows) {
    if (!row?.ticker || typeof row.cik_str !== "number") continue;
    map.set(row.ticker.trim().toUpperCase(), row.cik_str);
  }
  return map;
}

let tickerMap: { map: Map<string, number>; fetchedAt: number } | null = null;
const TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000;

/** The ticker-to-CIK map is a megabyte and changes rarely, so it is held for a day. */
export async function secCikForTicker(symbol: string): Promise<number | null> {
  if (!tickerMap || Date.now() - tickerMap.fetchedAt > TICKER_MAP_TTL_MS) {
    const response = await fetch(SEC_TICKERS_URL, { headers: SEC_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`SEC ticker map HTTP ${response.status}`);
    tickerMap = { map: parseTickerMap(await response.json()), fetchedAt: Date.now() };
  }
  return tickerMap.map.get(symbol.trim().toUpperCase()) ?? null;
}

/**
 * `expectedName` is supplied only where the ticker is not authoritative — a non-US listing — and a
 * filer whose name shares nothing with the holding is treated as a miss so the caller falls back.
 */
export async function fetchSecFilings(symbol: string, expectedName?: string): Promise<CompanyNewsItem[] | null> {
  const cik = await secCikForTicker(symbol);
  // No CIK means the issuer does not file with the SEC. Null, not empty: the caller falls back.
  if (cik == null) return null;
  const padded = String(cik).padStart(10, "0");
  const response = await fetch(`${SEC_SUBMISSIONS_URL}/CIK${padded}.json`, {
    headers: SEC_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`SEC submissions HTTP ${response.status}`);
  const payload = await response.json() as SecSubmissions;
  if (expectedName && !issuerNamesAgree(expectedName, payload.name ?? "")) return null;
  return parseSecFilings(symbol, cik, payload);
}
