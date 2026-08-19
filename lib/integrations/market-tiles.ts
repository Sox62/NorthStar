import {
  dateFromUnixSeconds,
  fetchYahooJson,
  numberValue,
  YAHOO_CHART_BASE_URL,
  type YahooChartResponse,
} from "./market-data";

export type MarketTileUnit = "oz" | "lb" | "index" | "unit";

/**
 * The reference markets on the State of play tiles. Gold, silver and platinum keep their live
 * Swissquote spot price on screen; this feed exists for the previous close behind the daily move,
 * and for the three tiles the spot feed does not cover at all.
 *
 * Every provider symbol was fetched and confirmed to return a quote before being listed here.
 * Sprott (U-UN.TO) prices in CAD, which is why the tiles show a currency rather than assuming USD.
 */
export const MARKET_TILE_INSTRUMENTS = [
  { key: "gold", label: "Gold", providerSymbol: "GC=F", currency: "USD", unit: "oz" },
  { key: "silver", label: "Silver", providerSymbol: "SI=F", currency: "USD", unit: "oz" },
  { key: "platinum", label: "Platinum", providerSymbol: "PL=F", currency: "USD", unit: "oz" },
  { key: "copper", label: "Copper", providerSymbol: "HG=F", currency: "USD", unit: "lb" },
  { key: "uranium", label: "Uranium", providerSymbol: "U-UN.TO", currency: "CAD", unit: "unit" },
  { key: "spx", label: "SPX", providerSymbol: "^GSPC", currency: "USD", unit: "index" },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  providerSymbol: string;
  currency: string;
  unit: MarketTileUnit;
}>;

export type MarketTileKey = typeof MARKET_TILE_INSTRUMENTS[number]["key"];

export type MarketTileQuote = {
  key: MarketTileKey;
  label: string;
  price: number;
  previousClose: number | null;
  currency: string;
  unit: MarketTileUnit;
  priceDate: string;
  source: string;
};

export type MarketTileBar = { date: string; close: number | null };

/**
 * The prior session's close, which is the only honest denominator for a daily move.
 *
 * Yahoo's meta gives no usable shortcut. `previousClose` is frequently absent, and
 * `chartPreviousClose` is the close before the *requested range* — five sessions back on a 5-day
 * request, which put gold at +0.7% against a real move of +1.0%.
 *
 * `regularMarketTime` is no better as a way to date the live price: gold futures trade nearly
 * around the clock, so the quote timestamp falls in the New York evening, which already belongs to
 * the next trading date. Dating the price by it slipped a whole session and reported gold at
 * -0.19% while it was up about 1%.
 *
 * The series structure is what can be trusted: Yahoo always appends the current session as the
 * last bar, complete or in progress or still empty. So that final date is the live session, and
 * the previous close is the last valid close belonging to any earlier one.
 */
export function previousCloseFromSeries(bars: MarketTileBar[]): number | null {
  if (bars.length === 0) return null;
  const currentSession = bars[bars.length - 1].date;
  for (let index = bars.length - 1; index >= 0; index -= 1) {
    const bar = bars[index];
    if (bar.date === currentSession) continue;
    if (bar.close && Number.isFinite(bar.close) && bar.close > 0) return bar.close;
  }
  return null;
}

function barsFromChart(result: NonNullable<NonNullable<YahooChartResponse["chart"]>["result"]>[number]): MarketTileBar[] {
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result.timestamp ?? [];
  const timezone = result.meta?.exchangeTimezoneName;
  const bars: MarketTileBar[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index];
    if (!timestamp) continue;
    // An empty close is kept: the still-unpriced final bar is how the current session is identified.
    bars.push({ date: dateFromUnixSeconds(timestamp, timezone), close: numberValue(closes[index]) ?? null });
  }
  return bars;
}

function lastClose(bars: MarketTileBar[]): number | null {
  for (let index = bars.length - 1; index >= 0; index -= 1) {
    const close = bars[index].close;
    if (close && close > 0) return close;
  }
  return null;
}

async function fetchMarketTileQuote(
  instrument: typeof MARKET_TILE_INSTRUMENTS[number],
): Promise<MarketTileQuote> {
  const url = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(instrument.providerSymbol)}?range=10d&interval=1d&includePrePost=false`;
  const payload = await fetchYahooJson(url);
  if (payload.chart?.error) {
    throw new Error(payload.chart.error.description ?? payload.chart.error.code ?? "Yahoo chart error");
  }
  const result = payload.chart?.result?.[0];
  if (!result) throw new Error("no quote returned");

  const bars = barsFromChart(result);
  const price = numberValue(result.meta?.regularMarketPrice) ?? lastClose(bars);
  if (!price) throw new Error("no price returned");
  const priceDate = bars[bars.length - 1]?.date ?? "";

  return {
    key: instrument.key,
    label: instrument.label,
    price,
    previousClose: previousCloseFromSeries(bars),
    currency: result.meta?.currency ?? instrument.currency,
    unit: instrument.unit,
    priceDate,
    source: "Yahoo Finance delayed chart",
  };
}

/** Fetches every tile in parallel; one dead symbol leaves the rest of the panel priced. */
export async function fetchMarketTileQuotes(): Promise<{ quotes: MarketTileQuote[]; errors: string[] }> {
  const settled = await Promise.allSettled(MARKET_TILE_INSTRUMENTS.map(fetchMarketTileQuote));
  const quotes: MarketTileQuote[] = [];
  const errors: string[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      quotes.push(outcome.value);
      return;
    }
    const reason = outcome.reason;
    errors.push(`${MARKET_TILE_INSTRUMENTS[index].label}: ${reason instanceof Error ? reason.message : "quote failed"}`);
  });
  return { quotes, errors };
}
