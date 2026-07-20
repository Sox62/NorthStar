const DEFAULT_TRADINGVIEW_CHART_URL = "https://www.tradingview.com/chart/";

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

export function tradingViewChartUrl(symbol: string) {
  const url = configuredTradingViewChartUrl();
  url.searchParams.set("symbol", symbol);
  return url.toString();
}
