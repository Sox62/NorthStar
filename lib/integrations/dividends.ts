import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import type { ImportedTransaction } from "./types";

const aliases = {
  account: ["account", "account number", "account id", "portfolio account"],
  symbol: ["symbol", "code", "ticker", "security code", "asx code"],
  name: ["name", "security", "company", "description", "holding"],
  exchange: ["exchange", "market"],
  currency: ["currency", "ccy"],
  paymentDate: ["payment date", "paid date", "pay date", "date paid", "date", "settlement date"],
  exDate: ["ex date", "ex-dividend date", "ex dividend date"],
  recordDate: ["record date"],
  franked: ["franked amount", "franked dividend", "franked"],
  unfranked: ["unfranked amount", "unfranked dividend", "unfranked"],
  gross: ["gross dividend", "gross amount", "gross", "income", "amount"],
  net: ["net cash", "net amount", "cash amount", "paid amount", "payment amount", "net dividend"],
  franking: ["franking credit", "franking credits", "imputation credit", "tax credit"],
  withholding: ["withholding tax", "tax withheld", "foreign withholding tax", "tax"],
  shares: ["shares", "units", "quantity", "holding balance"],
  centsPerShare: ["cents per share", "dividend per share", "rate", "cps"],
  reference: ["reference", "payment reference", "transaction id", "external id", "statement id"],
} as const;

const normaliseKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cleanText = (value: string) => value.replace(/\r/g, "\n").replace(/\*\*/g, "");
const directsharesDividendLabels = [
  "Account Number",
  "Account Name",
  "Dividend On",
  "Pay Date",
  "Ex Date",
  "Holdings as at Ex Date",
  "Gross Dividend Rate",
  "Gross Amount",
  "Fees",
  "Tax Withheld",
  "Net amount \\(Local\\)",
  "Exchange Rate @",
  "Net Amount \\(AUD\\)",
];

function read(row: Record<string, string>, keys: readonly string[]) {
  const normalised = new Map(Object.entries(row).map(([key, value]) => [normaliseKey(key), value]));
  for (const key of keys) {
    const value = normalised.get(normaliseKey(key));
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function numberValue(value: string) {
  if (!value) return 0;
  const negative = /^\(.*\)$/.test(value.trim());
  const match = value.replace(/,/g, "").match(/\(?-?\$?\s*(\d+(?:\.\d+)?)/);
  const parsed = match ? Number(match[1]) : Number(value.replace(/[()$,%\s,]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function isoDate(value: string) {
  const trimmed = value.trim();
  let match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return trimmed;
  match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  throw new Error(`Invalid dividend payment date: ${value}`);
}

function stableReference(input: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}

function splitCode(code: string) {
  const [symbol, suffix] = code.toUpperCase().split(":");
  if (!suffix) return { symbol, exchange: "ASX" };
  if (suffix === "US") return { symbol, exchange: "US" };
  if (suffix === "CA") return { symbol, exchange: "TSX/TSXV" };
  return { symbol, exchange: suffix };
}

function matchValue(text: string, label: string) {
  const source = cleanText(text).replace(/\s+/g, " ").trim();
  const nextLabels = directsharesDividendLabels
    .filter((item) => item !== label)
    .sort((left, right) => right.length - left.length)
    .join("|");
  const pattern = new RegExp(`${label}\\s*:?\\s*(.*?)(?=\\s+(?:${nextLabels})\\s*:?|$)`, "i");
  return source.match(pattern)?.[1]?.trim() || "";
}

function matchCurrencyAmount(text: string, label: string, roundToCents = true) {
  const value = matchValue(text, label);
  const match = value.match(/\b([A-Z]{3})\s*([($]?\s*[\d,]+(?:\.\d+)?\)?)/i);
  if (!match) return { currency: "", amount: 0 };
  const amount = Math.abs(numberValue(match[2]));
  return { currency: match[1].toUpperCase(), amount: roundToCents ? cents(amount) : amount };
}

function matchMoney(text: string, label: string) {
  return matchCurrencyAmount(text, label);
}

function audFromLocal(amount: number, exchangeRate: number) {
  return exchangeRate ? cents(amount / exchangeRate) : amount;
}

export function parseDirectsharesDividendText(text: string, subject = ""): ImportedTransaction {
  const source = cleanText(`${subject}\n${text}`);
  const account = matchValue(source, "Account Number") || source.match(/\bA\/C:\s*(\d{4,})/i)?.[1] || "DIVIDENDS";
  const codeValue = matchValue(source, "Dividend On");
  const code = (codeValue.match(/\b[A-Z][A-Z0-9]{0,5}(?::[A-Z]{2})?\b/i)?.[0] || source.match(/\b([A-Z][A-Z0-9]{0,5}:[A-Z]{2})\s+Dividend/i)?.[1] || "").toUpperCase();
  if (!code) throw new Error("Dividend security code was not found.");
  const instrument = splitCode(code);
  const payDate = isoDate(matchValue(source, "Pay Date"));
  const exDate = matchValue(source, "Ex Date");
  const grossRate = matchCurrencyAmount(source, "Gross Dividend Rate", false);
  const gross = matchMoney(source, "Gross Amount");
  const fees = matchMoney(source, "Fees");
  const withheld = matchMoney(source, "Tax Withheld");
  const netLocal = matchMoney(source, "Net amount \\(Local\\)");
  const netAud = matchMoney(source, "Net Amount \\(AUD\\)");
  const exchangeRate = numberValue(matchValue(source, "Exchange Rate @"));
  const shares = numberValue(matchValue(source, "Holdings as at Ex Date"));
  const localCurrency = gross.currency || netLocal.currency || grossRate.currency || "AUD";
  const netCashAud = netAud.amount || audFromLocal(netLocal.amount || gross.amount - withheld.amount - fees.amount, exchangeRate);
  const grossAud = localCurrency === "AUD" ? gross.amount : audFromLocal(gross.amount, exchangeRate);
  const feesAud = localCurrency === "AUD" ? fees.amount : audFromLocal(fees.amount, exchangeRate);
  const withholdingAud = localCurrency === "AUD" ? withheld.amount : audFromLocal(withheld.amount, exchangeRate);
  const reference = stableReference({ account, code, payDate, netCashAud, gross: gross.amount, withheld: withheld.amount });

  if (!netCashAud && !gross.amount) throw new Error("Dividend amount was not found.");

  return {
    externalId: `Dividend:${reference}`,
    externalAccountId: account,
    tradeDate: payDate,
    settleDate: payDate,
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    description: `${instrument.symbol} dividend`,
    instrumentKey: `Dividend:${instrument.symbol}:${instrument.exchange}`,
    type: "DIVIDEND",
    quantity: 0,
    price: grossRate.amount || undefined,
    cost: 0,
    currency: "AUD",
    fees: feesAud,
    taxes: withholdingAud,
    netCash: netCashAud,
    fxRateToBase: 1,
    source: "Dividend Statement",
    raw: {
      account,
      code,
      payDate,
      exDate: exDate ? isoDate(exDate) : null,
      shares,
      localCurrency,
      grossDividendLocal: gross.amount,
      grossDividendAud: grossAud,
      grossDividendRateLocal: grossRate.amount,
      feesLocal: fees.amount,
      feesAud,
      taxWithheldLocal: withheld.amount,
      taxWithheldAud: withholdingAud,
      netLocal: netLocal.amount,
      netAud: netCashAud,
      exchangeRate,
      subject,
      reference,
    },
  };
}

export function parseDividendCsv(csv: string): ImportedTransaction[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[];
  const transactions = rows.map((row, index) => {
    const symbol = read(row, aliases.symbol).toUpperCase();
    const paymentDate = read(row, aliases.paymentDate);
    if (!symbol) throw new Error(`Dividend row ${index + 1} is missing a symbol/code.`);
    if (!paymentDate) throw new Error(`Dividend row ${index + 1} is missing a payment date.`);

    const account = read(row, aliases.account) || "DIVIDENDS";
    const exchange = (read(row, aliases.exchange) || "ASX").toUpperCase();
    const currency = (read(row, aliases.currency) || "AUD").toUpperCase();
    const date = isoDate(paymentDate);
    const grossDividend = cents(numberValue(read(row, aliases.gross)));
    const frankedAmount = cents(numberValue(read(row, aliases.franked)));
    const unfrankedAmount = cents(numberValue(read(row, aliases.unfranked)));
    const frankingCredit = cents(numberValue(read(row, aliases.franking)));
    const withholdingTax = cents(Math.abs(numberValue(read(row, aliases.withholding))));
    const netCash = cents(numberValue(read(row, aliases.net)) || grossDividend - withholdingTax);
    const reference = read(row, aliases.reference) || stableReference({ account, symbol, date, grossDividend, netCash, frankingCredit, withholdingTax });

    if (!grossDividend && !netCash) throw new Error(`Dividend row ${index + 1} is missing an amount.`);

    return {
      externalId: `Dividend:${reference}`,
      externalAccountId: account,
      tradeDate: date,
      settleDate: date,
      symbol,
      exchange,
      description: read(row, aliases.name) || `${symbol} dividend`,
      instrumentKey: `Dividend:${symbol}:${exchange}`,
      type: "DIVIDEND",
      quantity: 0,
      price: numberValue(read(row, aliases.centsPerShare)) || undefined,
      cost: 0,
      currency,
      fees: 0,
      taxes: withholdingTax,
      netCash,
      fxRateToBase: currency === "AUD" ? 1 : undefined,
      source: "Dividend Statement",
      raw: {
        account,
        symbol,
        paymentDate: date,
        exDate: read(row, aliases.exDate) ? isoDate(read(row, aliases.exDate)) : null,
        recordDate: read(row, aliases.recordDate) ? isoDate(read(row, aliases.recordDate)) : null,
        grossDividend: grossDividend || netCash + withholdingTax,
        frankedAmount,
        unfrankedAmount,
        frankingCredit,
        withholdingTax,
        shares: numberValue(read(row, aliases.shares)),
        centsPerShare: numberValue(read(row, aliases.centsPerShare)),
        reference,
      },
    } satisfies ImportedTransaction;
  });

  if (!transactions.length) throw new Error("No dividend payments were found in this CSV.");
  return transactions;
}
