import type { PlatinumPrice } from "@/lib/storage";

const SOURCE_URL = "https://www.abcbullion.com/sell/platinum";
const PRODUCT_NAME = "1kg ABC Platinum Minted Tablet";

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(html: string) {
  return decodeHtml(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(value: string) {
  const number = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(number) || number <= 0) throw new Error("ABC Bullion returned an invalid platinum price.");
  return number;
}

export function parseAbcPlatinumPricePage(html: string, retrievedAt = new Date().toISOString()): PlatinumPrice {
  const text = htmlToText(html);
  const index = text.toLowerCase().indexOf(PRODUCT_NAME.toLowerCase());
  if (index < 0) throw new Error("NorthStar could not find ABC Bullion's 1 kg platinum product on the pricing page.");

  const productWindow = text.slice(index, index + 550);
  const values = [...productWindow.matchAll(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g)].map(match => parseMoney(match[1]));
  if (values.length < 2) throw new Error("NorthStar could not read ABC Bullion's platinum selling and buying prices.");

  const retailAudPerKg = values[0];
  const buybackAudPerKg = values[1];
  if (retailAudPerKg <= buybackAudPerKg) throw new Error("ABC Bullion's platinum price order was not recognised.");

  const spreadAudPerKg = retailAudPerKg - buybackAudPerKg;
  const priceDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(retrievedAt));

  return {
    provider: "ABC Bullion",
    productKey: "abc-platinum-1kg-minted-tablet",
    productName: PRODUCT_NAME,
    retailAudPerKg,
    buybackAudPerKg,
    spreadAudPerKg,
    spreadPercentOfRetail: retailAudPerKg ? spreadAudPerKg / retailAudPerKg * 100 : 0,
    sourceUrl: SOURCE_URL,
    priceDate,
    retrievedAt,
  };
}

export async function fetchAbcPlatinumPrice(): Promise<PlatinumPrice> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(SOURCE_URL, {
      cache: "no-store",
      headers: {
        "user-agent": "NorthStar/0.3.7 (private portfolio valuation; contact via account owner)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ABC Bullion price request failed with status ${response.status}.`);
    return parseAbcPlatinumPricePage(await response.text());
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("ABC Bullion's price page did not respond in time.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
