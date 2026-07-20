import type { DailyPriceInput, FxRateInput, PriceableInstrument } from "@/lib/storage";

export type MarketQuote = DailyPriceInput & {
  providerSymbol: string;
  fetchedAt: string;
};

export type QuoteFailure = {
  symbol: string;
  exchange: string;
  message: string;
};

export type QuoteRefreshResult = {
  prices: DailyPriceInput[];
  fxRates: FxRateInput[];
  quotes: MarketQuote[];
  failures: QuoteFailure[];
  providerConfigured: boolean;
  providers: {
    requested: QuoteProvider;
    eodhdConfigured: boolean;
    globalXEnabled: boolean;
    yahooEnabled: boolean;
    stooqEnabled: boolean;
  };
};

export type QuoteProvider = "auto" | "eodhd" | "globalx" | "yahoo" | "stooq";

type EodhdResponse = {
  code?: string;
  timestamp?: number;
  gmtoffset?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  previousClose?: number;
  price?: number;
  volume?: number;
  error?: string;
  message?: string;
};

type FrankfurterRateResponse = {
  date?: string;
  base?: string;
  quote?: string;
  rate?: number;
  error?: string;
  message?: string;
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        exchangeTimezoneName?: string;
        regularMarketTime?: number;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
};

type SwissquoteQuoteResponse = Array<{
  spreadProfilePrices?: Array<{
    bid?: number;
    ask?: number;
    spreadProfile?: string;
  }>;
  ts?: number;
}>;

const MARKETDATA_TIMEOUT_MS = 12_000;
const EODHD_BASE_URL = "https://eodhd.com/api/real-time";
const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v2/rate";
const STOOQ_DAILY_URL = "https://stooq.com/q/d/l/";
const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const SWISSQUOTE_BBO_BASE_URL = "https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument";
const GLOBAL_X_FUNDS_BASE_URL = "https://www.globalxetfs.com.au/funds";
const GLOBAL_X_FUNDS: Record<string, { slug: string; currency: string }> = {
  ETPMAG: { slug: "etpmag", currency: "AUD" },
};

const METAL_SPOT_INSTRUMENTS = [
  { metal: "gold", label: "Gold spot", providerSymbol: "XAU/USD" },
  { metal: "silver", label: "Silver spot", providerSymbol: "XAG/USD" },
  { metal: "platinum", label: "Plat spot", providerSymbol: "XPT/USD" },
] as const;

export type MetalSpotQuote = {
  metal: typeof METAL_SPOT_INSTRUMENTS[number]["metal"];
  label: string;
  providerSymbol: string;
  currency: "USD";
  unit: "oz";
  bid: number;
  ask: number;
  price: number;
  priceDate: string;
  retrievedAt: string;
  source: "Swissquote spot mid";
};

export type MetalSpotResult = {
  quotes: MetalSpotQuote[];
  errors: string[];
  source: "Swissquote";
};

function todaySydney() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function yyyymmdd(value: Date) {
  return value.toISOString().slice(0, 10).replaceAll("-", "");
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normaliseSymbol(value: string) {
  return value.trim().toUpperCase();
}

function normaliseCurrency(value: string) {
  return value.trim().toUpperCase();
}

function normaliseExchange(value: string) {
  return value.trim().toUpperCase();
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean).map((value) => value!.trim()).filter(Boolean))];
}

function exchangeIncludes(exchange: string, pattern: RegExp) {
  const value = normaliseExchange(exchange);
  return pattern.test(value);
}

function eodhdExchangeSuffixes(exchange: string) {
  const value = normaliseExchange(exchange);
  if (["ASX", "AU", "AUS", "CHIXAU"].includes(value)) return ["AU"];
  if (["TSXV", "TSXVENTURE", "VENTURE", "V"].includes(value)) return ["V", "TO"];
  if (["TSX", "TSE", "TO", "CA", "CANADA", "TSX/TSXV"].includes(value)) return ["TO", "V", "CN"];
  if (["CSE", "CN"].includes(value)) return ["CN", "TO", "V"];
  if (["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS", "US", "NYSEARCA"].includes(value)) return ["US"];
  if (["LSE", "LON", "LN", "GB", "UK"].includes(value)) return ["LSE"];
  if (exchangeIncludes(value, /TSXV|VENTURE/)) return ["V", "TO"];
  if (exchangeIncludes(value, /TSX|CANADA|\bCA\b/)) return ["TO", "V", "CN"];
  return [value || "US"];
}

function yahooSuffixes(exchange: string) {
  const value = normaliseExchange(exchange);
  if (["ASX", "AU", "AUS", "CHIXAU"].includes(value)) return ["AX"];
  if (["TSXV", "TSXVENTURE", "VENTURE", "V"].includes(value)) return ["V", "TO"];
  if (["TSX", "TSE", "TO", "CA", "CANADA", "TSX/TSXV"].includes(value)) return ["TO", "V", "CN"];
  if (["CSE", "CN"].includes(value)) return ["CN", "TO", "V"];
  if (["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS", "US", "NYSEARCA"].includes(value)) return [""];
  if (["LSE", "LON", "LN", "GB", "UK"].includes(value)) return ["L"];
  if (exchangeIncludes(value, /TSXV|VENTURE/)) return ["V", "TO"];
  if (exchangeIncludes(value, /TSX|CANADA|\bCA\b/)) return ["TO", "V", "CN"];
  return [value];
}

function stooqSymbol(symbol: string, exchange: string) {
  const value = normaliseExchange(exchange);
  if (!["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS", "US", "NYSEARCA"].includes(value)) return null;
  return `${normaliseSymbol(symbol).toLowerCase()}.us`;
}

function providerOverride(instrument: PriceableInstrument, envName: string) {
  const overrides = process.env[envName]?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  const key = `${normaliseSymbol(instrument.symbol)}:${normaliseExchange(instrument.exchange)}`;
  for (const override of overrides) {
    const [left, right] = override.split("=").map((part) => part?.trim());
    if (left?.toUpperCase() === key && right) return right;
  }
  return null;
}

function eodhdSymbols(instrument: PriceableInstrument) {
  const override = providerOverride(instrument, "MARKETDATA_EODHD_SYMBOL_OVERRIDES") ?? providerOverride(instrument, "MARKETDATA_SYMBOL_OVERRIDES");
  if (override) return [override];
  const symbol = normaliseSymbol(instrument.symbol);
  return unique(eodhdExchangeSuffixes(instrument.exchange).map((suffix) => `${symbol}.${suffix}`));
}

function yahooSymbols(instrument: PriceableInstrument) {
  const override = providerOverride(instrument, "MARKETDATA_YAHOO_SYMBOL_OVERRIDES");
  if (override) return [override];
  const symbol = normaliseSymbol(instrument.symbol);
  return unique(yahooSuffixes(instrument.exchange).map((suffix) => suffix ? `${symbol}.${suffix}` : symbol));
}

function eodhdDate(response: EodhdResponse) {
  if (response.timestamp) {
    const offsetSeconds = response.gmtoffset ?? 0;
    return new Date((response.timestamp + offsetSeconds) * 1000).toISOString().slice(0, 10);
  }
  return todaySydney();
}

function dateFromUnixMilliseconds(milliseconds: number) {
  return new Date(milliseconds).toISOString().slice(0, 10);
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "NorthStar/0.3.7 private portfolio quote refresh" },
    signal: AbortSignal.timeout(MARKETDATA_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<EodhdResponse>;
}

async function fetchSwissquoteJson(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "NorthStar/0.3.7 private portfolio metals quote refresh" },
    signal: AbortSignal.timeout(MARKETDATA_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<SwissquoteQuoteResponse>;
}

async function fetchRateJson(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "NorthStar/0.3.7 private portfolio quote refresh" },
    signal: AbortSignal.timeout(MARKETDATA_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<FrankfurterRateResponse>;
}

async function fetchYahooJson(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "NorthStar/0.3.7 private portfolio quote refresh" },
    signal: AbortSignal.timeout(MARKETDATA_TIMEOUT_MS),
  });
  if (response.status === 429) throw new Error("Yahoo Finance rate limited this environment with HTTP 429.");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (/too many requests/i.test(text)) throw new Error("Yahoo Finance rate limited this environment.");
  try {
    return JSON.parse(text) as YahooChartResponse;
  } catch {
    throw new Error("Yahoo Finance returned a non-JSON response.");
  }
}

async function fetchText(url: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": "NorthStar/0.3.7 private portfolio quote refresh" },
      signal: AbortSignal.timeout(MARKETDATA_TIMEOUT_MS),
    });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? error.cause as { code?: string; hostname?: string } | undefined : undefined;
    const detail = cause?.code ? `${cause.code}${cause.hostname ? ` ${cause.hostname}` : ""}` : error instanceof Error ? error.message : "fetch failed";
    throw new Error(`Unable to fetch provider page: ${detail}`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchSwissquoteMetalSpotQuote(spec: typeof METAL_SPOT_INSTRUMENTS[number]): Promise<MetalSpotQuote> {
  const url = `${SWISSQUOTE_BBO_BASE_URL}/${spec.providerSymbol.split("/").map(encodeURIComponent).join("/")}`;
  const payload = await fetchSwissquoteJson(url);
  const candidates = payload
    .flatMap((quote) => (quote.spreadProfilePrices ?? []).map((price) => ({
      bid: numberValue(price.bid),
      ask: numberValue(price.ask),
      timestamp: quote.ts,
    })))
    .filter((price): price is { bid: number; ask: number; timestamp: number | undefined } =>
      price.bid != null && price.ask != null && price.ask >= price.bid
    )
    .sort((a, b) => (a.ask - a.bid) - (b.ask - b.bid));
  const best = candidates[0];
  if (!best) throw new Error(`${spec.providerSymbol} returned no valid bid/ask quote.`);
  const retrievedAt = new Date(best.timestamp ?? Date.now()).toISOString();
  return {
    metal: spec.metal,
    label: spec.label,
    providerSymbol: spec.providerSymbol,
    currency: "USD",
    unit: "oz",
    bid: best.bid,
    ask: best.ask,
    price: (best.bid + best.ask) / 2,
    priceDate: best.timestamp ? dateFromUnixMilliseconds(best.timestamp) : todaySydney(),
    retrievedAt,
    source: "Swissquote spot mid",
  };
}

export async function fetchMetalSpotQuotes(): Promise<MetalSpotResult> {
  const quotes: MetalSpotQuote[] = [];
  const errors: string[] = [];
  for (const spec of METAL_SPOT_INSTRUMENTS) {
    try {
      quotes.push(await fetchSwissquoteMetalSpotQuote(spec));
    } catch (error) {
      errors.push(`${spec.label}: ${error instanceof Error ? error.message : "quote failed"}`);
    }
  }
  return { quotes, errors, source: "Swissquote" };
}

function dateFromUnixSeconds(seconds: number, timeZone?: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(seconds * 1000));
  } catch {
    return new Date(seconds * 1000).toISOString().slice(0, 10);
  }
}

function dateFromAustralianLabel(value: string) {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!match) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(match[2].slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const day = match[1].padStart(2, "0");
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${day}`;
}

function parseGlobalXFundPage(html: string) {
  const navMatch =
    html.match(/"label":"NAV\/Unit \(A\$\)","valueType":"text","textValue":"([0-9.,]+)"/) ??
    html.match(/NAV\/Unit \(A\$\)[\s\S]{0,500}?>([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)</);
  const close = navMatch ? numberValue(navMatch[1].replaceAll(",", "")) : null;
  if (!close) return null;
  const dateMatch =
    html.match(/Date as of\s*<!-- -->\s*([0-9]{1,2}\s+[A-Za-z]{3,}\s+[0-9]{4})/) ??
    html.match(/Date as of\s*",\s*"([0-9]{1,2}\s+[A-Za-z]{3,}\s+[0-9]{4})"/) ??
    html.match(/"card-date","children":\[\[" Date as of ","([0-9]{1,2}\s+[A-Za-z]{3,}\s+[0-9]{4})"/);
  return {
    close,
    priceDate: dateMatch ? dateFromAustralianLabel(dateMatch[1]) ?? todaySydney() : todaySydney(),
  };
}

function yahooCurrencyAndClose(close: number, yahooCurrency: string | undefined, expectedCurrency: string) {
  const expected = normaliseCurrency(expectedCurrency);
  const raw = yahooCurrency?.trim() || expected;
  const rawUpper = raw.toUpperCase();
  if ((raw === "GBp" || rawUpper === "GBX") && expected === "GBP") {
    return { close: close / 100, currency: "GBP" };
  }
  if (rawUpper !== expected) throw new Error(`Yahoo returned ${rawUpper} for an instrument stored as ${expected}.`);
  return { close, currency: expected };
}

async function fetchFromCandidates(
  providerName: string,
  providerSymbols: string[],
  fetchOne: (providerSymbol: string) => Promise<MarketQuote | null>,
) {
  const errors: string[] = [];
  for (const providerSymbol of providerSymbols) {
    try {
      const quote = await fetchOne(providerSymbol);
      if (quote) return quote;
      errors.push(`${providerSymbol} returned no close`);
    } catch (error) {
      errors.push(`${providerSymbol} ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  if (errors.length) throw new Error(`${providerName} ${errors.join("; ")}`);
  return null;
}

async function fetchEodhdQuote(instrument: PriceableInstrument, token: string): Promise<MarketQuote | null> {
  return fetchFromCandidates("EODHD", eodhdSymbols(instrument), async (providerSymbol) => {
    const url = `${EODHD_BASE_URL}/${encodeURIComponent(providerSymbol)}?api_token=${encodeURIComponent(token)}&fmt=json`;
    const payload = await fetchJson(url);
    if (payload.error || payload.message) throw new Error(payload.error ?? payload.message ?? "EODHD quote error");
    const close = numberValue(payload.close) ?? numberValue(payload.price) ?? numberValue(payload.previousClose);
    if (!close) return null;
    return {
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      close,
      currency: instrument.currency,
      priceDate: eodhdDate(payload),
      source: "EODHD delayed quote",
      providerSymbol,
      fetchedAt: new Date().toISOString(),
    };
  });
}

async function fetchYahooQuote(instrument: PriceableInstrument): Promise<MarketQuote | null> {
  return fetchFromCandidates("Yahoo Finance", yahooSymbols(instrument), async (providerSymbol) => {
    const url = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(providerSymbol)}?range=10d&interval=1d&includePrePost=false`;
    const payload = await fetchYahooJson(url);
    if (payload.chart?.error) throw new Error(payload.chart.error.description ?? payload.chart.error.code ?? "Yahoo chart error");
    const result = payload.chart?.result?.[0];
    if (!result) return null;
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const timestamps = result.timestamp ?? [];
    const timezone = result.meta?.exchangeTimezoneName;
    for (let index = closes.length - 1; index >= 0; index -= 1) {
      const close = numberValue(closes[index]);
      const timestamp = timestamps[index] ?? result.meta?.regularMarketTime;
      if (!close || !timestamp) continue;
      const adjusted = yahooCurrencyAndClose(close, result.meta?.currency, instrument.currency);
      return {
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        close: adjusted.close,
        currency: adjusted.currency,
        priceDate: dateFromUnixSeconds(timestamp, timezone),
        source: "Yahoo Finance delayed chart",
        providerSymbol,
        fetchedAt: new Date().toISOString(),
      };
    }
    const fallbackClose = numberValue(result.meta?.regularMarketPrice) ?? numberValue(result.meta?.previousClose) ?? numberValue(result.meta?.chartPreviousClose);
    const fallbackTime = result.meta?.regularMarketTime;
    if (!fallbackClose || !fallbackTime) return null;
    const adjusted = yahooCurrencyAndClose(fallbackClose, result.meta?.currency, instrument.currency);
    return {
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      close: adjusted.close,
      currency: adjusted.currency,
      priceDate: dateFromUnixSeconds(fallbackTime, timezone),
      source: "Yahoo Finance delayed chart",
      providerSymbol,
      fetchedAt: new Date().toISOString(),
    };
  });
}

async function fetchGlobalXQuote(instrument: PriceableInstrument): Promise<MarketQuote | null> {
  const fund = GLOBAL_X_FUNDS[normaliseSymbol(instrument.symbol)];
  if (!fund) return null;
  const expectedCurrency = normaliseCurrency(instrument.currency);
  if (expectedCurrency !== fund.currency) {
    throw new Error(`Global X ${instrument.symbol} NAV is ${fund.currency}, but the instrument is stored as ${expectedCurrency}.`);
  }
  const providerSymbol = `${instrument.symbol.toUpperCase()}.GLOBALX`;
  const url = `${GLOBAL_X_FUNDS_BASE_URL}/${encodeURIComponent(fund.slug)}/`;
  const parsed = parseGlobalXFundPage(await fetchText(url));
  if (!parsed) return null;
  return {
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    close: parsed.close,
    currency: fund.currency,
    priceDate: parsed.priceDate,
    source: "Global X NAV per unit",
    providerSymbol,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchEodhdFx(currency: string, date: string, token: string): Promise<FxRateInput | null> {
  const value = currency.trim().toUpperCase();
  if (value === "AUD") return null;
  const providerSymbol = `${value}AUD.FOREX`;
  const url = `${EODHD_BASE_URL}/${encodeURIComponent(providerSymbol)}?api_token=${encodeURIComponent(token)}&fmt=json`;
  const payload = await fetchJson(url);
  const rateToAud = numberValue(payload.close) ?? numberValue(payload.price) ?? numberValue(payload.previousClose);
  if (!rateToAud) return null;
  return { currency: value, rateToAud, rateDate: eodhdDate(payload) || date, source: "EODHD FX" };
}

export async function fetchFrankfurterFx(currency: string, date?: string): Promise<FxRateInput | null> {
  const value = currency.trim().toUpperCase();
  if (!value || value === "AUD") return null;
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const url = `${FRANKFURTER_BASE_URL}/${encodeURIComponent(value)}/AUD${query}`;
  const payload = await fetchRateJson(url);
  if (payload.error || payload.message) throw new Error(payload.error ?? payload.message ?? "Frankfurter FX error");
  const rateToAud = numberValue(payload.rate);
  if (!rateToAud) return null;
  return {
    currency: value,
    rateToAud,
    rateDate: payload.date && /^\d{4}-\d{2}-\d{2}$/.test(payload.date) ? payload.date : date ?? todaySydney(),
    source: "Frankfurter FX",
  };
}

function parseStooqCsv(text: string) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length < 2) return null;
  const columns = rows[0].split(",").map((item) => item.trim().toLowerCase());
  const closeIndex = columns.indexOf("close");
  const dateIndex = columns.indexOf("date");
  for (const row of rows.slice(1).reverse()) {
    const values = row.split(",").map((item) => item.trim());
    const close = numberValue(values[closeIndex]);
    const date = values[dateIndex];
    if (close && /^\d{4}-\d{2}-\d{2}$/.test(date)) return { close, date };
  }
  return null;
}

async function fetchStooqQuote(instrument: PriceableInstrument): Promise<MarketQuote | null> {
  const providerSymbol = stooqSymbol(instrument.symbol, instrument.exchange);
  if (!providerSymbol) return null;
  const end = new Date();
  const start = new Date(end.getTime() - 21 * 24 * 60 * 60 * 1000);
  const url = `${STOOQ_DAILY_URL}?s=${encodeURIComponent(providerSymbol)}&d1=${yyyymmdd(start)}&d2=${yyyymmdd(end)}&i=d`;
  const response = await fetch(url, {
    headers: { "user-agent": "NorthStar/0.3.7 private portfolio quote refresh" },
    signal: AbortSignal.timeout(MARKETDATA_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Stooq HTTP ${response.status}`);
  const text = await response.text();
  if (/<html[\s>]/i.test(text) || /requires JavaScript|__verify/i.test(text)) {
    throw new Error("Stooq requires browser verification from this environment. Configure EODHD or use manual/CSV prices.");
  }
  const parsed = parseStooqCsv(text);
  if (!parsed) return null;
  return {
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    close: parsed.close,
    currency: instrument.currency,
    priceDate: parsed.date,
    source: "Stooq delayed daily close",
    providerSymbol,
    fetchedAt: new Date().toISOString(),
  };
}

function inferredFxRate(instrument: PriceableInstrument, date: string): FxRateInput | null {
  const currency = instrument.currency.trim().toUpperCase();
  if (currency === "AUD") return null;
  if (!instrument.lastPrice || !instrument.quantity || !instrument.marketValueAud) return null;
  const rateToAud = instrument.marketValueAud / (instrument.quantity * instrument.lastPrice);
  if (!Number.isFinite(rateToAud) || rateToAud <= 0) return null;
  return { currency, rateToAud, rateDate: date, source: "Inferred from current position" };
}

export async function refreshMarketQuotes(instruments: PriceableInstrument[], provider: QuoteProvider = "auto"): Promise<QuoteRefreshResult> {
  const token = process.env.EODHD_API_TOKEN?.trim() || process.env.MARKETDATA_EODHD_API_TOKEN?.trim() || "";
  const prices: DailyPriceInput[] = [];
  const fxRates = new Map<string, FxRateInput>();
  const quotes: MarketQuote[] = [];
  const failures: QuoteFailure[] = [];
  const quoteProviders = provider === "auto"
    ? unique([token ? "eodhd" : null, "globalx", "yahoo", "stooq"]) as Array<Exclude<QuoteProvider, "auto">>
    : [provider];
  const useEodhdFx = Boolean(token) && provider !== "stooq";
  const providers = {
    requested: provider,
    eodhdConfigured: Boolean(token),
    globalXEnabled: provider === "auto" || provider === "globalx",
    yahooEnabled: provider === "auto" || provider === "yahoo",
    stooqEnabled: provider === "auto" || provider === "stooq",
  };

  for (const instrument of instruments) {
    const providerErrors: string[] = [];
    let quote: MarketQuote | null = null;
    for (const quoteProvider of quoteProviders) {
      try {
        if (quoteProvider === "eodhd" && !token) {
          providerErrors.push("EODHD token is not configured.");
          continue;
        }
        if (quoteProvider === "eodhd") quote = await fetchEodhdQuote(instrument, token);
        if (quoteProvider === "globalx") quote = await fetchGlobalXQuote(instrument);
        if (quoteProvider === "yahoo") quote = await fetchYahooQuote(instrument);
        if (quoteProvider === "stooq") quote = await fetchStooqQuote(instrument);
        if (quote) break;
        providerErrors.push(`${quoteProvider.toUpperCase()} returned no price.`);
      } catch (error) {
        providerErrors.push(error instanceof Error ? error.message : `${quoteProvider.toUpperCase()} failed.`);
      }
    }

    if (!quote) {
      failures.push({
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        message: providerErrors.join("; ") || "No supported quote provider returned a price for this instrument.",
      });
      continue;
    }

    quotes.push(quote);
    prices.push({
      symbol: quote.symbol,
      exchange: quote.exchange,
      close: quote.close,
      currency: quote.currency,
      priceDate: quote.priceDate,
      source: quote.source,
    });

    if (quote.currency.toUpperCase() !== "AUD") {
      let rate: FxRateInput | null = null;
      if (useEodhdFx) rate = await fetchEodhdFx(quote.currency, quote.priceDate, token).catch(() => null);
      rate ??= await fetchFrankfurterFx(quote.currency, quote.priceDate).catch(() => null);
      rate ??= inferredFxRate(instrument, quote.priceDate);
      if (rate) fxRates.set(`${rate.currency}:${rate.rateDate}:${rate.source}`, rate);
    }
  }

  return {
    prices,
    fxRates: [...fxRates.values()],
    quotes,
    failures,
    providerConfigured: provider === "eodhd" ? providers.eodhdConfigured : true,
    providers,
  };
}
