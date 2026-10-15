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

type PreparedRow = {
  row: Record<string, string>;
  symbol: string;
  exchange: string;
  tradeDate: string;
  rawType: string;
  /** Signed as the file states it: negative on a sell, and on a consolidation's unit reduction. */
  quantity: number;
  price: ReturnType<typeof numberValue>;
};

/**
 * The holding this export itself reported immediately before and after each corporate action.
 *
 * A ratio is the same for every holder of a security; a quantity delta never is. The report covers
 * one Directshares account, so its −94,355 PDN consolidation is that account's reduction alone —
 * while the lot pool also holds the 12,661 units bought in the second account, which this file
 * cannot see. Inferring the ratio from the pool would read a 1-for-10 consolidation as 1-for-5 and
 * leave the cost base wrong by half, with nothing anywhere to say so.
 *
 * So the export states the ratio from its own running balance, which is the one holding the delta
 * is known to describe. Prior actions are applied along the way: BOE's bonus issue sits on 3,750
 * units, not the 30,000 bought before its consolidation.
 */
function corporateActionRatios(rows: PreparedRow[]) {
  const ratios = new Map<PreparedRow, { before: number; after: number }>();
  const balances = new Map<string, number>();
  const ordered = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) =>
      a.row.symbol.localeCompare(b.row.symbol)
      || a.row.tradeDate.localeCompare(b.row.tradeDate)
      || a.index - b.index);

  for (const { row } of ordered) {
    const key = `${row.symbol}:${row.exchange}`;
    const before = balances.get(key) ?? 0;
    const after = before + row.quantity;
    balances.set(key, after);
    if (row.rawType === "BUY" || row.rawType === "SELL") continue;
    // No ratio where the running balance is unusable: GOLD's split sits on −250 units because its
    // purchases predate every export supplied. Stating nothing leaves the engine to report it.
    if (before > 0 && after > 0) ratios.set(row, { before, after });
  }
  return ratios;
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

  const prepared: PreparedRow[] = [];
  for (const row of rows) {
    const symbol = (row.Code ?? "").trim().toUpperCase().replace(/\//g, ".");
    // Per-market sheets repeat the header, so a second "Code" line is not a trade.
    if (!symbol || symbol === "CODE") continue;
    /*
     * "Total" closes the combined listing. Stopping there matters because the workbook restates the
     * same trades in per-market sheets below it, and reading those would both double every trade
     * and corrupt the running balance the ratios above are taken from.
     */
    if (symbol === "TOTAL") break;

    const tradeDate = isoDate(row.Date);
    const rawType = (row.Type ?? "").trim().toUpperCase();
    const quantity = numberValue(row.Qty);
    if (!tradeDate || !quantity) continue;

    prepared.push({
      row,
      symbol,
      exchange: exchangeFor(row["Market Code"] ?? ""),
      tradeDate,
      rawType,
      quantity,
      price: numberValue(row.Price),
    });
  }

  const ratios = corporateActionRatios(prepared);
  const seen = new Map<string, number>();
  const transactions: ImportedTransaction[] = [];

  for (const entry of prepared) {
    const { row, symbol, exchange, tradeDate, rawType, quantity, price } = entry;

    /*
     * Corporate actions ride in the same report — VAU appears as a "Consolidation" of -42,307 units
     * with no price. They are not trades, but dropping them here is what made them invisible: the
     * consolidation went unrecorded, the parcel kept its pre-consolidation unit cost, and VAU's
     * gain was overstated by $16,948 with nothing anywhere to say so. They are now carried through
     * as their own type for the lot engine to apply, and to complain about if it cannot.
     */
    if (rawType !== "BUY" && rawType !== "SELL") {
      const ratio = ratios.get(entry);
      transactions.push({
        externalId: `DS-ACTION:${symbol}:${exchange}:${tradeDate}:${rawType}:${quantity}`,
        tradeDate,
        symbol,
        exchange,
        description: (row.Type ?? "").trim() || "Corporate action",
        instrumentKey: `Directshares:${symbol}:${exchange}`,
        type: "CORPORATE_ACTION",
        // Signed: the change in units the action applies, which is all the ratio needs.
        quantity,
        currency: (row["Instrument Currency"] ?? "AUD").trim().toUpperCase() || "AUD",
        source: "Directshares All Trades Report",
        raw: {
          ...row,
          ...(ratio ? { actionQuantityBefore: ratio.before, actionQuantityAfter: ratio.after } : {}),
        },
      });
      continue;
    }

    if (price == null) continue;
    const currency = (row["Instrument Currency"] ?? "AUD").trim().toUpperCase() || "AUD";
    const exchangeRate = numberValue(row["Exch. Rate"]);
    const brokerage = numberValue(row.Brokerage) ?? 0;

    /*
     * Identical trades on one day are legitimate, so repeats are numbered rather than dropped; the
     * id stays stable across re-imports of the same file, which is what dedupe relies on.
     *
     * The number is also recorded on the row, because the id alone cannot be trusted to identify
     * one trade across two exports: it embeds the price, and a later export of the same history at
     * finer precision mints a new id for the same trade. BOE's 12,263-unit sale arrived as both
     * ":3.73" and ":3.7323", and the engine cannot tell two records of one trade from two genuine
     * fills by looking at the source alone. The fill number can: one sale reported twice is fill 1
     * twice, whereas two fills are 1 and 2.
     */
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
      // The export states brokerage in AUD whatever the instrument is priced in.
      raw: { ...row, fillIndex: occurrence, feeCurrency: "AUD" },
    });
  }

  if (!transactions.length) throw new Error("No Directshares trades were found in this CSV.");
  return transactions;
}
