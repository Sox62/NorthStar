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
    stooqEnabled: boolean;
  };
};

export type QuoteProvider = "auto" | "eodhd" | "stooq";

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

const MARKETDATA_TIMEOUT_MS = 12_000;
const EODHD_BASE_URL = "https://eodhd.com/api/real-time";
const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v2/rate";
const STOOQ_DAILY_URL = "https://stooq.com/q/d/l/";

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

function normaliseExchange(value: string) {
  return value.trim().toUpperCase();
}

function eodhdExchangeSuffix(exchange: string) {
  const value = normaliseExchange(exchange);
  if (["ASX", "AU", "AUS"].includes(value)) return "AU";
  if (["TSX", "TSE", "TO"].includes(value)) return "TO";
  if (["TSXV", "TSXVENTURE", "VENTURE", "V"].includes(value)) return "V";
  if (["CSE", "CN"].includes(value)) return "CN";
  if (["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS", "US", "NYSEARCA"].includes(value)) return "US";
  if (["LSE", "LON", "LN"].includes(value)) return "LSE";
  return value || "US";
}

function stooqSymbol(symbol: string, exchange: string) {
  const value = normaliseExchange(exchange);
  if (!["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS", "US", "NYSEARCA"].includes(value)) return null;
  return `${normaliseSymbol(symbol).toLowerCase()}.us`;
}

function providerOverride(instrument: PriceableInstrument) {
  const overrides = process.env.MARKETDATA_SYMBOL_OVERRIDES?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  const key = `${normaliseSymbol(instrument.symbol)}:${normaliseExchange(instrument.exchange)}`;
  for (const override of overrides) {
    const [left, right] = override.split("=").map((part) => part?.trim());
    if (left?.toUpperCase() === key && right) return right;
  }
  return null;
}

function eodhdSymbol(instrument: PriceableInstrument) {
  return providerOverride(instrument) ?? `${normaliseSymbol(instrument.symbol)}.${eodhdExchangeSuffix(instrument.exchange)}`;
}

function eodhdDate(response: EodhdResponse) {
  if (response.timestamp) {
    const offsetSeconds = response.gmtoffset ?? 0;
    return new Date((response.timestamp + offsetSeconds) * 1000).toISOString().slice(0, 10);
  }
  return todaySydney();
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "NorthStar/0.3.7 private portfolio quote refresh" },
    signal: AbortSignal.timeout(MARKETDATA_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<EodhdResponse>;
}

async function fetchRateJson(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "NorthStar/0.3.7 private portfolio quote refresh" },
    signal: AbortSignal.timeout(MARKETDATA_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<FrankfurterRateResponse>;
}

async function fetchEodhdQuote(instrument: PriceableInstrument, token: string): Promise<MarketQuote | null> {
  const providerSymbol = eodhdSymbol(instrument);
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
  const useEodhd = provider !== "stooq" && Boolean(token);
  const useStooq = provider !== "eodhd";
  const providers = {
    requested: provider,
    eodhdConfigured: Boolean(token),
    stooqEnabled: useStooq,
  };

  for (const instrument of instruments) {
    try {
      let quote: MarketQuote | null = null;
      if (useEodhd) quote = await fetchEodhdQuote(instrument, token);
      if (!quote && useStooq) quote = await fetchStooqQuote(instrument);
      if (!quote) {
        failures.push({
          symbol: instrument.symbol,
          exchange: instrument.exchange,
          message: provider === "eodhd" && !token
            ? "EODHD token is not configured."
            : "No supported quote provider returned a price for this instrument.",
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
        if (useEodhd) rate = await fetchEodhdFx(quote.currency, quote.priceDate, token).catch(() => null);
        rate ??= await fetchFrankfurterFx(quote.currency, quote.priceDate).catch(() => null);
        rate ??= inferredFxRate(instrument, quote.priceDate);
        if (rate) fxRates.set(`${rate.currency}:${rate.rateDate}:${rate.source}`, rate);
      }
    } catch (error) {
      failures.push({
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        message: error instanceof Error ? error.message : "Unable to fetch quote.",
      });
    }
  }

  return {
    prices,
    fxRates: [...fxRates.values()],
    quotes,
    failures,
    providerConfigured: providers.eodhdConfigured || provider !== "eodhd",
    providers,
  };
}
