const DEFAULT_TRADINGVIEW_CHART_URL = "https://www.tradingview.com/chart/rps0WMxt/";

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
  "URA:ARCA": "AMEX:URA",
  "URA:NYSEARCA": "AMEX:URA",
  "UUUU:US": "AMEX:UUUU",
  // Physical metal has no listing of its own, so chart it against the spot benchmark.
  "PLATINUM:PHYSICAL": "ACTIVTRADES:PLATINUM",
};

const usTradingViewExchanges = new Set([
  "NYSE", "NASDAQ", "AMEX", "ARCA", "NYSEARCA", "BATS", "NYSEAMERICAN", "NYSEMKT",
]);
const tsxVentureExchanges = new Set(["TSXV", "TSX-V", "CVE", "VENTURE"]);
const canadianExchanges = new Set(["TSX", "TSE", "CA", "CANADA", "TSX/TSXV", "NEO"]);
const londonExchanges = new Set(["LSE", "LON", "GB", "LONDON"]);

function normaliseUsTradingViewExchange(exchange: string) {
  return ["ARCA", "NYSEARCA", "NYSEAMERICAN", "NYSEMKT"].includes(exchange) ? "AMEX" : exchange;
}

function tradingViewFxPairSymbol(symbol: string, exchange: string) {
  const match = symbol.match(/^([A-Z]{3})[./]?([A-Z]{3})$/);
  if (!match) return null;
  if (exchange === "IDEALFX" || exchange.includes("FOREX") || exchange.includes("FX")) {
    return `FX_IDC:${match[1]}${match[2]}`;
  }
  return null;
}

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
  const fxPairSymbol = tradingViewFxPairSymbol(symbol, exchange);
  if (fxPairSymbol) return fxPairSymbol;
  if (tradingViewOverrides[key]) return tradingViewOverrides[key];
  if (exchange.includes("ASX")) return `ASX:${symbol}`;
  if (usTradingViewExchanges.has(exchange)) return `${normaliseUsTradingViewExchange(exchange)}:${symbol}`;
  if (exchange === "US") return tradingViewOverrides[`${symbol}:US`] ?? symbol;
  // Matched against explicit sets, not substrings: exchange.includes("CA") also matched
  // PHYSICAL and NYSEAMERICAN, sending bullion and every NYSE American holding to TSX.
  if (tsxVentureExchanges.has(exchange)) return `TSXV:${symbol}`;
  if (canadianExchanges.has(exchange)) return `TSX:${symbol}`;
  if (londonExchanges.has(exchange)) return `LSE:${symbol}`;
  return exchange ? `${exchange}:${symbol}` : symbol;
}

export function tradingViewChartUrl(symbol: string) {
  const url = configuredTradingViewChartUrl();
  url.searchParams.set("symbol", symbol);
  return url.toString();
}

export function tradingViewRatioExpression(leftSymbol: string, rightSymbol: string) {
  return leftSymbol + "/" + rightSymbol;
}

export function tradingViewRatioChartUrl(leftSymbol: string, rightSymbol: string) {
  return tradingViewChartUrl(tradingViewRatioExpression(leftSymbol, rightSymbol));
}
