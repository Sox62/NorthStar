import { parse } from "csv-parse/sync";
import { PDFParse } from "pdf-parse";
import type { ImportedTransaction, OpeningPosition, TransactionType } from "./types";

const numberValue = (value: unknown) => Number(String(value ?? "").replace(/[$,%\s,]/g, "")) || 0;
const moneyValue = (value: string) => Number(value.replace(/[$,\s]/g, "")) || 0;
const cents = (value: number) => Math.round(value * 100) / 100;

function splitCode(code: string) {
  const compact = code.match(/^([A-Z][A-Z0-9]{1,4})(US|CA|GB)$/);
  if (!code.includes(":") && compact) return splitCode(`${compact[1]}:${compact[2]}`);
  const [rawSymbol, suffix] = code.split(":");
  const symbol = rawSymbol.replace(/\//g, ".");
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
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

function firstDateAfter(lines: string[], index: number) {
  return lines.slice(Math.max(0, index + 1)).flatMap((line) => line.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) ?? [])[0];
}

function directsharesSide(text: string, lines: string[]): TransactionType {
  const heading = lines.find((line) => /^(BUY|SELL) CONFIRMATION(?: DETAILS)?$/i.test(line));
  const headingSide = heading?.match(/^(BUY|SELL)\b/i)?.[1]?.toUpperCase();
  if (headingSide === "BUY" || headingSide === "SELL") return headingSide;

  const buyIndex = text.search(/BUY CONFIRMATION/i);
  const sellIndex = text.search(/SELL CONFIRMATION/i);
  if (buyIndex >= 0 && (sellIndex < 0 || buyIndex < sellIndex)) return "BUY";
  if (sellIndex >= 0) return "SELL";
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

function parseInstrumentCode(code: string) {
  const instrument = splitCode(code);
  return { ...instrument, code };
}

function findInstrumentCode(lines: string[]) {
  const withMarket = lines.findIndex((line) => /^[A-Z][A-Z0-9]{0,5}:[A-Z]{2}$/.test(line));
  if (withMarket >= 0) return { index: withMarket, instrument: parseInstrumentCode(lines[withMarket]) };
  const excluded = new Set(["AUD", "ASX", "BUY", "SELL", "REPRINT"]);
  const index = lines.findIndex((line) => /^[A-Z][A-Z0-9]{1,5}$/.test(line) && !excluded.has(line));
  return index >= 0 ? { index, instrument: parseInstrumentCode(lines[index]) } : null;
}

function quantityAndConsideration(lines: string[], symbolIndex: number) {
  const combined = firstMatch(lines, /^\d+(?:,\d{3})*(?:\.\d+)?\s+\$[\d,]+\.\d{2}$/);
  const combinedMatch = combined?.match(/^(\d+(?:,\d{3})*(?:\.\d+)?)\s+(\$[\d,]+\.\d{2})$/);
  if (combinedMatch) return { quantity: numberValue(combinedMatch[1]), consideration: moneyValue(combinedMatch[2]), line: combined };

  for (let index = Math.max(0, symbolIndex + 1); index < lines.length - 1; index += 1) {
    if (/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(lines[index]) && /^\$[\d,]+\.\d{2}$/.test(lines[index + 1])) {
      return { quantity: numberValue(lines[index]), consideration: moneyValue(lines[index + 1]), line: lines[index + 1] };
    }
  }

  throw new Error("Directshares quantity and consideration were not found.");
}

export function parseDirectsharesConfirmationText(text: string): ImportedTransaction {
  const lines = normaliseLines(text);
  const side = directsharesSide(text, lines);
  const dates = lines.flatMap((line) => line.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) ?? []);
  if (dates.length < 2) throw new Error("Directshares confirmation dates were not found.");

  const accountAndConfirmation = lines.filter((line) => /^\d{6,}$/.test(line));
  const account = accountAndConfirmation[0] || "DIRECTSHARES";
  const confirmation = accountAndConfirmation[1];
  if (!confirmation) throw new Error("Directshares confirmation number was not found.");

  const instrumentMatch = findInstrumentCode(lines);
  if (!instrumentMatch) throw new Error("Directshares security code was not found.");
  const { index: symbolIndex, instrument } = instrumentMatch;
  const { symbol, exchange } = instrument;

  const { quantity, consideration, line: quantityLine } = quantityAndConsideration(lines, symbolIndex);
  const priceLine = firstMatch(lines, /^\d+\.\d{2,6}$/);
  const price = priceLine ? Number(priceLine) : quantity ? consideration / quantity : 0;
  const avPrice = text.match(/Av Price:\s*(\d+(?:\.\d+)?)\s*([A-Z]{3})\.\s*Rate:\s*(\d+(?:\.\d+)?)/i);
  const tradeCurrency = avPrice?.[2] || instrument.currency;
  const settlementCurrency = text.match(/(?:Net Proceeds|Total Amount Payable):\s*\(([A-Z]{3})\)/i)?.[1] || "AUD";

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
  const confirmationIndex = lines.findIndex((line) => line === confirmation);
  const avPriceIndex = lines.findIndex((line) => /Av Price:/i.test(line));
  const tradeDate = firstDateAfter(lines, avPriceIndex) || dates[0];
  const settleDate = firstDateAfter(lines, confirmationIndex) || dates[1] || tradeDate;

  return {
    externalId: `Directshares:${confirmation}`,
    externalAccountId: account,
    tradeDate: isoDate(tradeDate),
    settleDate: isoDate(settleDate),
    symbol,
    exchange,
    description,
    instrumentKey: `Directshares:${symbol}:${exchange}`,
    type: side,
    quantity: signedQuantity(side, quantity),
    price,
    cost: signedCost(side, consideration),
    currency: settlementCurrency,
    fees,
    taxes: 0,
    netCash: signedNetCash(side, netAmount),
    fxRateToBase: settlementCurrency === "AUD" ? 1 : undefined,
    source: "Directshares Contract Note",
    raw: {
      account,
      confirmation,
      side,
      code: instrument.code,
      quantity,
      consideration,
      netAmount,
      fees,
      tradeCurrency,
      tradePrice: avPrice ? Number(avPrice[1]) : undefined,
      tradeFxRate: avPrice ? Number(avPrice[3]) : undefined,
    },
  };
}

function directsharesConfirmationCsvSide(value: string): TransactionType {
  const side = value.trim().toUpperCase();
  if (side === "BUY" || side === "SELL") return side;
  throw new Error(`Invalid Directshares order type: ${value}`);
}

function parseAveragePrice(value: string) {
  const match = value.trim().match(/^([\d,.]+)\s*([A-Z]{3})?/);
  return {
    price: match ? numberValue(match[1]) : 0,
    currency: match?.[2],
  };
}

function rowCharge(row: Record<string, string>, key: string) {
  return numberValue(row[key]);
}

function directsharesCsvFees(row: Record<string, string>, grossAud: number, considerationAud: number) {
  const charges = [
    "Brokerage",
    "GST",
    "Stampduty",
    "Application Fee",
    "OtherCharge",
    "Fee",
  ].reduce((sum, key) => sum + rowCharge(row, key), 0) - rowCharge(row, "Discount");
  const derived = Math.abs(Math.abs(considerationAud) - Math.abs(grossAud));
  return cents(charges || derived);
}

function parseDirectsharesConfirmationCsvRow(row: Record<string, string>): ImportedTransaction | null {
  const confirmation = row["Confirmation Number"]?.trim();
  const code = row.AsxCode?.trim();
  if (!confirmation || !code) return null;

  const side = directsharesConfirmationCsvSide(row["Order Type"] || "");
  const instrument = parseInstrumentCode(code);
  const quantity = numberValue(row.Quantity);
  const priceAud = numberValue(row.Price);
  const grossAud = cents(priceAud * quantity);
  const considerationAud = numberValue(row.Consideration);
  const fees = directsharesCsvFees(row, grossAud, considerationAud);
  const averagePrice = parseAveragePrice(row["Avg Price"] || "");
  const tradeDate = row["Trade Date"]?.trim() || row["As at Date"]?.trim();
  const settleDate = row["Settlement Date"]?.trim() || row["Trade Date"]?.trim() || tradeDate;
  if (!tradeDate) throw new Error(`Directshares confirmation ${confirmation} is missing a trade date.`);

  return {
    externalId: `Directshares:${confirmation}`,
    externalAccountId: row["Account Number"]?.trim() || "DIRECTSHARES",
    tradeDate: isoDate(tradeDate),
    settleDate: settleDate ? isoDate(settleDate) : undefined,
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    description: instrument.symbol,
    instrumentKey: `Directshares:${instrument.symbol}:${instrument.exchange}`,
    type: side,
    quantity: signedQuantity(side, quantity),
    price: priceAud,
    cost: signedCost(side, grossAud),
    currency: "AUD",
    fees,
    taxes: 0,
    netCash: signedNetCash(side, considerationAud),
    fxRateToBase: 1,
    source: "Directshares Contract Note",
    raw: {
      account: row["Account Number"]?.trim() || "DIRECTSHARES",
      accountName: row["Account Name"]?.trim(),
      confirmation,
      side,
      code,
      quantity,
      grossAud,
      consideration: considerationAud,
      fees,
      tradeCurrency: averagePrice.currency || instrument.currency,
      tradePrice: averagePrice.price || undefined,
      tradeFxRate: numberValue(row["Exch Rate"]) || undefined,
      settlementCurrency: "AUD",
      asAtDate: row["As at Date"]?.trim() || undefined,
      sourceFormat: "Directshares confirmation CSV",
      reverseConfirmationNumber: row["Reverse Confirmation Number"]?.trim() || undefined,
    },
  };
}

export function parseDirectsharesConfirmationCsv(csv: string): ImportedTransaction[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count_more: true }) as Record<string, string>[];
  const hasConfirmationHeaders = rows.length
    && "Confirmation Number" in rows[0]
    && "AsxCode" in rows[0]
    && "Order Type" in rows[0]
    && "Consideration" in rows[0];
  if (!hasConfirmationHeaders) throw new Error("No Directshares confirmation rows were found in this CSV.");

  const transactions = rows
    .map(parseDirectsharesConfirmationCsvRow)
    .filter((transaction): transaction is ImportedTransaction => Boolean(transaction));
  if (!transactions.length) throw new Error("No Directshares confirmation rows were found in this CSV.");
  return transactions;
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
