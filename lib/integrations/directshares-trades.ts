import { parse } from "csv-parse/sync";
import type { ImportedTransaction } from "./types";

/**
 * The Directshares "All Trades Report", which is the only export that carries a trade date. The
 * holdings and profit-and-loss exports give cost basis but no history, which is why every
 * Directshares position reconstructs as a fallback CGT lot with no acquisition date.
 */
const TRADE_HEADERS = ["Code", "Market Code", "Date", "Type", "Qty", "Price"];

/**
 * Market codes as the holdings importer spells them. These must agree exactly: a CGT lot joins to
 * a position through `Directshares:SYMBOL:EXCHANGE`, so "NYSE" here against "US" there would leave
 * the position undated with its trades sitting in storage unmatched.
 */
const EXCHANGES: Record<string, string> = {
  ASX: "ASX",
  NYSE: "US",
  NASDAQ: "US",
  AMEX: "US",
  US: "US",
  CVE: "TSX/TSXV",
  TSE: "TSX/TSXV",
  TSX: "TSX/TSXV",
  TSXV: "TSX/TSXV",
  CA: "TSX/TSXV",
  LSE: "LSE",
  GB: "LSE",
};

function exchangeFor(marketCode: string) {
  const value = marketCode.trim().toUpperCase();
  return EXCHANGES[value] ?? value;
}

function numberValue(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isoDate(value: string | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // Directshares writes ISO dates, but a spreadsheet round-trip can localise them to d/m/Y.
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

/**
 * The report is written for reading, not parsing: a title line sits above the header row, and
 * per-market sheets repeat both. The header row is found rather than assumed.
 */
function headerLine(csv: string) {
  const lines = csv.split(/\r?\n/);
  const index = lines.findIndex((line) => /^"?Code"?\s*,/.test(line.trim()));
  return index >= 0 ? index : -1;
}

export function looksLikeDirectsharesAllTrades(csv: string) {
  const index = headerLine(csv);
  if (index < 0) return false;
  const header = csv.split(/\r?\n/)[index];
  return TRADE_HEADERS.every((column) => header.includes(column));
}

/**
 * The rate that turns a local amount into AUD.
 *
 * The report does not keep one convention. ExxonMobil's buy quotes 0.670094, which is USD per AUD
 * and must be divided by; its sell quotes 1.394081, which is AUD per USD and must be multiplied.
 * Applying either rule to both rows misprices that position by more than half.
 *
 * So the rate is derived from the file's own Value column, which is stated in AUD and is therefore
 * the one unambiguous number on the row:
 *
 *   buy:  Value = gross x fx + brokerage
 *   sell: |Value| = gross x fx - brokerage
 *
 * Where Value is absent the orientation is inferred instead: AUD is weaker than every currency in
 * this book, so a rate below 1 is quoted per AUD and inverts, and a rate above 1 already is AUD.
 */
function fxRateToBase(input: {
  currency: string;
  grossLocal: number;
  valueAud: number | undefined;
  brokerage: number;
  isBuy: boolean;
  exchangeRate: number | undefined;
}) {
  if (input.currency === "AUD") return 1;

  if (input.valueAud != null && input.grossLocal > 0) {
    const audExcludingBrokerage = input.isBuy
      ? Math.abs(input.valueAud) - input.brokerage
      : Math.abs(input.valueAud) + input.brokerage;
    const derived = audExcludingBrokerage / input.grossLocal;
    if (Number.isFinite(derived) && derived > 0) return derived;
  }

  const rate = input.exchangeRate;
  if (!rate || rate <= 0) return 1;
  return rate < 1 ? 1 / rate : rate;
}

export function parseDirectsharesAllTradesCsv(csv: string): ImportedTransaction[] {
  const index = headerLine(csv);
  if (index < 0) throw new Error("No Directshares All Trades header row was found in this CSV.");

  const rows = parse(csv, {
    columns: true,
    from_line: index + 1,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const seen = new Map<string, number>();
  const transactions: ImportedTransaction[] = [];

  for (const row of rows) {
    const symbol = (row.Code ?? "").trim().toUpperCase().replace(/\//g, ".");
    // Per-market sheets repeat the header and end with a "Total" line; neither is a trade.
    if (!symbol || symbol === "CODE" || symbol === "TOTAL") continue;

    const tradeDate = isoDate(row.Date);
    const rawType = (row.Type ?? "").trim().toUpperCase();
    const quantity = numberValue(row.Qty);
    const price = numberValue(row.Price);
    if (!tradeDate || !quantity || price == null) continue;
    // Corporate actions ride in the same report: VAU appears as a "Consolidation" of -42,307 units
    // with no price. It changes a share count without being a trade, so it cannot become a lot.
    if (rawType !== "BUY" && rawType !== "SELL") continue;

    const exchange = exchangeFor(row["Market Code"] ?? "");
    const currency = (row["Instrument Currency"] ?? "AUD").trim().toUpperCase() || "AUD";
    const exchangeRate = numberValue(row["Exch. Rate"]);
    const brokerage = numberValue(row.Brokerage) ?? 0;

    // Identical trades on one day are legitimate, so repeats are numbered rather than dropped;
    // the id stays stable across re-imports of the same file, which is what dedupe relies on.
    const base = `DS-TRADE:${symbol}:${exchange}:${tradeDate}:${rawType}:${quantity}:${price}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);

    transactions.push({
      externalId: occurrence > 1 ? `${base}#${occurrence}` : base,
      tradeDate,
      symbol,
      exchange,
      description: (row.Name ?? "").trim() || symbol,
      instrumentKey: `Directshares:${symbol}:${exchange}`,
      type: rawType,
      quantity: Math.abs(quantity),
      price,
      // Gross consideration in the instrument's own currency; fees are already AUD.
      cost: Math.abs(quantity) * price,
      currency,
      fees: brokerage,
      fxRateToBase: fxRateToBase({
        currency,
        grossLocal: Math.abs(quantity) * price,
        valueAud: numberValue(row.Value),
        brokerage,
        isBuy: rawType === "BUY",
        exchangeRate,
      }),
      source: "Directshares All Trades Report",
      raw: { ...row },
    });
  }

  if (!transactions.length) throw new Error("No Directshares trades were found in this CSV.");
  return transactions;
}
