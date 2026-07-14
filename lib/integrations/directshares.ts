import { parse } from "csv-parse/sync";
import type { OpeningPosition } from "./types";

const numberValue = (value: unknown) => Number(String(value ?? "").replace(/[$,%\s,]/g, "")) || 0;

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
