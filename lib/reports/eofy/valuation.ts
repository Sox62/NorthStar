import type { PriceBook, StoredDailyPrice, StoredFxRate } from "@/lib/storage";
import type { OpenTaxLot } from "@/lib/tax-lots";
import type { EofyHistoricalCostRow, EofyValuationStatus } from "./types";

export function upper(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function exchangeMatchRank(priceExchange: string, rowMarket: string) {
  const price = upper(priceExchange);
  const market = upper(rowMarket);
  if (price === market) return 0;

  const canadian = new Set(["CA", "CANADA", "TSX", "TSXV", "TSE", "CVE"]);
  if (canadian.has(price) && canadian.has(market)) return 1;

  const australian = new Set(["AU", "ASX", "CHIXAU"]);
  if (australian.has(price) && australian.has(market)) return 1;

  const us = new Set(["US", "USA", "NYSE", "NASDAQ", "AMEX", "ARCA"]);
  if (us.has(price) && us.has(market)) return 1;

  return null;
}

function canonicalMarket(value: string) {
  const market = upper(value);
  if (["CA", "CANADA", "TSX", "TSXV", "TSE", "CVE"].includes(market)) return "CA";
  if (["AU", "ASX", "CHIXAU"].includes(market)) return "ASX";
  if (["US", "USA", "NYSE", "NASDAQ", "AMEX", "ARCA"].includes(market)) return "US";
  return market;
}

function latestEofyPrice(priceBook: PriceBook | undefined, row: Pick<EofyHistoricalCostRow, "code" | "market">, endDate: string): StoredDailyPrice | null {
  if (!priceBook) return null;
  return priceBook.prices
    .map((price) => ({ price, rank: upper(price.symbol) === upper(row.code) ? exchangeMatchRank(price.exchange, row.market) : null }))
    .filter((candidate): candidate is { price: StoredDailyPrice; rank: number } => candidate.rank != null && candidate.price.priceDate <= endDate)
    .sort((a, b) => a.rank - b.rank || b.price.priceDate.localeCompare(a.price.priceDate) || b.price.retrievedAt.localeCompare(a.price.retrievedAt))[0]?.price ?? null;
}

function latestEofyFx(priceBook: PriceBook | undefined, currency: string, endDate: string): StoredFxRate | null {
  if (upper(currency) === "AUD") {
    return {
      id: "AUD",
      currency: "AUD",
      rateToAud: 1,
      rateDate: endDate,
      source: "AUD",
      retrievedAt: `${endDate}T00:00:00.000Z`,
    };
  }
  if (!priceBook) return null;
  return priceBook.fxRates
    .filter((rate) => upper(rate.currency) === upper(currency) && rate.rateDate <= endDate)
    .sort((a, b) => b.rateDate.localeCompare(a.rateDate) || b.retrievedAt.localeCompare(a.retrievedAt))[0] ?? null;
}

export function historicalValuation(row: Pick<EofyHistoricalCostRow, "code" | "market" | "closingQuantity">, priceBook: PriceBook | undefined, endDate: string): Pick<EofyHistoricalCostRow, "closingMarketValueAud" | "closingPrice" | "closingPriceCurrency" | "closingPriceDate" | "closingFxRateToAud" | "closingValuationStatus" | "closingValuationSource"> {
  if (Math.abs(row.closingQuantity) <= 0.000001) {
    return {
      closingMarketValueAud: 0,
      closingPrice: null,
      closingPriceCurrency: null,
      closingPriceDate: null,
      closingFxRateToAud: null,
      closingValuationStatus: "zero_quantity",
      closingValuationSource: "No open quantity at EOFY.",
    };
  }

  const price = latestEofyPrice(priceBook, row, endDate);
  if (!price) {
    return {
      closingMarketValueAud: null,
      closingPrice: null,
      closingPriceCurrency: null,
      closingPriceDate: null,
      closingFxRateToAud: null,
      closingValuationStatus: "missing_price",
      closingValuationSource: null,
    };
  }

  const fx = latestEofyFx(priceBook, price.currency, endDate);
  if (!fx) {
    return {
      closingMarketValueAud: null,
      closingPrice: price.close,
      closingPriceCurrency: price.currency,
      closingPriceDate: price.priceDate,
      closingFxRateToAud: null,
      closingValuationStatus: "missing_fx",
      closingValuationSource: price.source,
    };
  }

  const status: EofyValuationStatus = price.priceDate === endDate ? "exact" : "prior_close";
  return {
    closingMarketValueAud: row.closingQuantity * price.close * fx.rateToAud,
    closingPrice: price.close,
    closingPriceCurrency: price.currency,
    closingPriceDate: price.priceDate,
    closingFxRateToAud: fx.rateToAud,
    closingValuationStatus: status,
    closingValuationSource: fx.currency === "AUD" ? price.source : `${price.source}; FX ${fx.source} ${fx.rateDate}`,
  };
}

export function historicalKey(input: Pick<EofyHistoricalCostRow, "code" | "market"> | Pick<OpenTaxLot, "symbol" | "exchange">) {
  const code = "code" in input ? input.code : input.symbol;
  const market = "market" in input ? input.market : input.exchange;
  return `${upper(code)}:${canonicalMarket(market)}`;
}
