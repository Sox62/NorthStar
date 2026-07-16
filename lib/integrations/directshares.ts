import { parse } from "csv-parse/sync";
import { PDFParse } from "pdf-parse";
import type { ImportedTransaction, OpeningPosition, TransactionType } from "./types";

const numberValue = (value: unknown) => Number(String(value ?? "").replace(/[$,%\s,]/g, "")) || 0;
const moneyValue = (value: string) => Number(value.replace(/[$,\s]/g, "")) || 0;
const cents = (value: number) => Math.round(value * 100) / 100;

function splitCode(code: string) {
  const [symbol, suffix] = code.split(":");
  if (!suffix) return { symbol, exchange: "ASX", currency: "AUD" };
  if (suffix === "US") return { symbol, exchange: "US", currency: "USD" };
  if (suffix === "CA") return { symbol, exchange: "TSX/TSXV", currency: "CAD" };
  if (suffix === "GB") return { symbol, exchange: "LSE", currency: "GBP" };
  return { symbol, exchange: suffix, currency: "AUD" };
}

export function parseDirectsharesHoldingsCsv(csv: string): OpeningPosition[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[];
  const positions = rows
    .filter(row => row.Code && row.Code.toUpperCase() !== "TOTALS")
    .map(row => {
      const instrument = splitCode(row.Code);
      return {
        externalAccountId: row["Account Number"],
        accountName: row["Account Name"],
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        currency: instrument.currency,
        quantity: numberValue(row["Units Held"]),
        lastPrice: numberValue(row.Last),
        fxRate: numberValue(row["FX Rate"]) || undefined,
        averageCostAud: numberValue(row["Net Avg Price AUD"]),
        costAud: numberValue(row["Cost AUD"]),
        marketValueAud: numberValue(row["Market Value AUD"]),
        dayGainAud: numberValue(row["Day Gain AUD"]),
        pnlAud: numberValue(row["P&L AUD"]),
        pnlPercent: numberValue(row["P&L %"]),
      } satisfies OpeningPosition;
    });

  if (!positions.length) throw new Error("No Directshares holdings were found in this CSV.");
  return positions;
}

function normaliseLines(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isoDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error(`Invalid Directshares date: ${value}`);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function firstMatch(lines: string[], pattern: RegExp) {
  return lines.find((line) => pattern.test(line));
}

function lineAfter(lines: string[], index: number) {
  return index >= 0 && index + 1 < lines.length ? lines[index + 1] : undefined;
}

function directsharesSide(text: string): TransactionType {
  if (/SELL CONFIRMATION/i.test(text)) return "SELL";
  if (/BUY CONFIRMATION/i.test(text)) return "BUY";
  throw new Error("Directshares confirmation side was not found.");
}

function signedQuantity(side: TransactionType, quantity: number) {
  return side === "SELL" ? -Math.abs(quantity) : Math.abs(quantity);
}

function signedNetCash(side: TransactionType, netAmount: number) {
  return side === "SELL" ? Math.abs(netAmount) : -Math.abs(netAmount);
}

function signedCost(side: TransactionType, consideration: number) {
  return side === "SELL" ? -Math.abs(consideration) : Math.abs(consideration);
}

export function parseDirectsharesConfirmationText(text: string): ImportedTransaction {
  const lines = normaliseLines(text);
  const side = directsharesSide(text);
  const dates = lines.flatMap((line) => line.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) ?? []);
  if (dates.length < 2) throw new Error("Directshares confirmation dates were not found.");

  const accountAndConfirmation = lines.filter((line) => /^\d{6,}$/.test(line));
  const account = accountAndConfirmation[0] || "DIRECTSHARES";
  const confirmation = accountAndConfirmation[1];
  if (!confirmation) throw new Error("Directshares confirmation number was not found.");

  const symbolIndex = lines.findIndex((line) => /^[A-Z][A-Z0-9]{1,5}$/.test(line) && !["AUD", "ASX"].includes(line));
  const symbol = symbolIndex >= 0 ? lines[symbolIndex] : "";
  if (!symbol) throw new Error("Directshares security code was not found.");

  const quantityLine = firstMatch(lines, /^\d+(?:,\d{3})*(?:\.\d+)?\s+\$[\d,]+\.\d{2}$/);
  const quantityMatch = quantityLine?.match(/^(\d+(?:,\d{3})*(?:\.\d+)?)\s+(\$[\d,]+\.\d{2})$/);
  if (!quantityMatch) throw new Error("Directshares quantity and consideration were not found.");

  const quantity = numberValue(quantityMatch[1]);
  const consideration = moneyValue(quantityMatch[2]);
  const priceLine = firstMatch(lines, /^\d+\.\d{2,6}$/);
  const price = priceLine ? Number(priceLine) : quantity ? consideration / quantity : 0;

  const netLabel = side === "SELL" ? /Net Proceeds/i : /Net (?:Amount )?Payable|Amount Due|Net Debit/i;
  let netAmount = 0;
  const labelledNet = text.match(new RegExp(`${netLabel.source}[^$]*\\$([\\d,]+\\.\\d{2})`, "i"));
  if (labelledNet) netAmount = moneyValue(labelledNet[1]);
  if (!netAmount) {
    const moneyValues = lines.map((line) => line.match(/^\$[\d,]+\.\d{2}$/)?.[0]).filter((value): value is string => Boolean(value)).map(moneyValue);
    const candidates = moneyValues.filter((value) => Math.abs(value - consideration) <= Math.max(500, consideration * 0.05) && value !== consideration);
    netAmount = side === "SELL" ? Math.min(...candidates) : Math.max(...candidates);
  }
  if (!Number.isFinite(netAmount) || !netAmount) throw new Error("Directshares net settlement amount was not found.");

  const fees = cents(Math.abs(consideration - netAmount));
  const fallbackName = symbol;
  const description = lineAfter(lines, lines.findIndex((line) => line === quantityLine)) || lines[symbolIndex - 1] || fallbackName;

  return {
    externalId: `Directshares:${confirmation}`,
    externalAccountId: account,
    tradeDate: isoDate(dates[0]),
    settleDate: isoDate(dates[1]),
    symbol,
    exchange: "ASX",
    description,
    instrumentKey: `Directshares:${symbol}:ASX`,
    type: side,
    quantity: signedQuantity(side, quantity),
    price,
    cost: signedCost(side, consideration),
    currency: "AUD",
    fees,
    taxes: 0,
    netCash: signedNetCash(side, netAmount),
    fxRateToBase: 1,
    source: "Directshares Contract Note",
    raw: {
      account,
      confirmation,
      side,
      quantity,
      consideration,
      netAmount,
      fees,
    },
  };
}

export async function parseDirectsharesConfirmationPdf(input: Buffer | Uint8Array | ArrayBuffer): Promise<ImportedTransaction> {
  const data = Buffer.isBuffer(input)
    ? input
    : input instanceof ArrayBuffer
      ? Buffer.from(input)
      : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return parseDirectsharesConfirmationText(result.text);
  } finally {
    await parser.destroy();
  }
}
