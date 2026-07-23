const DEFAULT_TRADINGVIEW_CHART_URL = "https://www.tradingview.com/chart/";

export type TradingViewInstrument = {
  symbol: string;
  exchange?: string | null;
};

const tradingViewOverrides: Record<string, string> = {
  "CDE:US": "NYSE:CDE",
  "XOM:US": "NYSE:XOM",
  "EC:US": "NYSE:EC",
  "HL:US": "NYSE:HL",
  "AG:US": "NYSE:AG",
  "NEM:US": "NYSE:NEM",
  "PAAS:US": "NASDAQ:PAAS",
  "GDX:US": "AMEX:GDX",
  "SIL:US": "AMEX:SIL",
  "SILJ:US": "AMEX:SILJ",
  "URNM:US": "AMEX:URNM",
  "URA:US": "AMEX:URA",
  "UUUU:US": "AMEX:UUUU",
};

function configuredTradingViewChartUrl() {
  const configured = process.env.NEXT_PUBLIC_TRADINGVIEW_CHART_URL?.trim();
  if (!configured) return new URL(DEFAULT_TRADINGVIEW_CHART_URL);
  try {
    const url = new URL(configured);
    const host = url.hostname.toLowerCase();
    if (host !== "tradingview.com" && !host.endsWith(".tradingview.com")) return new URL(DEFAULT_TRADINGVIEW_CHART_URL);
    return url;
  } catch {
    return new URL(DEFAULT_TRADINGVIEW_CHART_URL);
  }
}

export function tradingViewSymbolForInstrument(instrument: TradingViewInstrument) {
  const symbol = instrument.symbol.trim().toUpperCase();
  const exchange = instrument.exchange?.trim().toUpperCase() ?? "";
  const key = `${symbol}:${exchange}`;
  if (tradingViewOverrides[key]) return tradingViewOverrides[key];
  if (exchange.includes("ASX")) return `ASX:${symbol}`;
  if (exchange === "TSX/TSXV") return `TSX:${symbol}`;
  if (exchange.includes("TSXV") || exchange.includes("VENTURE")) return `TSXV:${symbol}`;
  if (exchange.includes("TSX") || exchange.includes("CA")) return `TSX:${symbol}`;
  if (exchange.includes("LSE") || exchange.includes("GB")) return `LSE:${symbol}`;
  if (exchange === "US") return symbol;
  return exchange ? `${exchange}:${symbol}` : symbol;
}

export function tradingViewChartUrl(symbol: string) {
  const url = configuredTradingViewChartUrl();
  url.searchParams.set("symbol", symbol);
  return url.toString();
}
