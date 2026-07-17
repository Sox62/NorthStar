import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const priceSchema = z.object({
  symbol: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  exchange: z.string().trim().optional().default(""),
  close: z.coerce.number().positive(),
  currency: z.string().trim().min(3).transform((value) => value.toUpperCase()),
  priceDate: dateSchema,
  source: z.string().trim().min(1).default("Manual"),
  fxRateToAud: z.coerce.number().positive().optional(),
});

const fxSchema = z.object({
  currency: z.string().trim().min(3).transform((value) => value.toUpperCase()),
  rateToAud: z.coerce.number().positive(),
  rateDate: dateSchema,
  source: z.string().trim().min(1).default("Manual"),
});

const bodySchema = z.object({
  prices: z.array(priceSchema).default([]),
  fxRates: z.array(fxSchema).default([]),
});

function value(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const match = Object.entries(row).find(([candidate]) => candidate.trim().toLowerCase() === key.toLowerCase());
    if (match && match[1] !== undefined && match[1] !== "") return match[1];
  }
  return undefined;
}

function parseCsv(text: string) {
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, unknown>[];
  const prices: unknown[] = [];
  const fxRates: unknown[] = [];
  for (const row of rows) {
    const symbol = value(row, "symbol", "ticker", "code");
    const currency = value(row, "currency", "ccy");
    const source = value(row, "source", "provider") ?? "Manual";
    if (symbol) {
      prices.push({
        symbol,
        exchange: value(row, "exchange", "market") ?? "",
        close: value(row, "close", "price", "last"),
        currency: currency ?? "AUD",
        priceDate: value(row, "priceDate", "date", "asOfDate"),
        source,
        fxRateToAud: value(row, "fxRateToAud", "fx", "rateToAud"),
      });
    } else if (currency) {
      fxRates.push({
        currency,
        rateToAud: value(row, "rateToAud", "fxRateToAud", "fx", "rate"),
        rateDate: value(row, "rateDate", "date", "asOfDate"),
        source,
      });
    }
  }
  return { prices, fxRates };
}

export async function GET(request: Request) {
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 80);
    return NextResponse.json(await getStorage().listPriceBook(limit));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load price book" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const raw = contentType.includes("application/json")
      ? await request.json()
      : parseCsv(await request.text());
    const input = bodySchema.parse(raw);
    if (!input.prices.length && !input.fxRates.length) throw new Error("Supply at least one price or FX rate.");
    const result = await getStorage().recordDailyPrices(input.prices, input.fxRates);
    return NextResponse.json({ saved: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid price import" }, { status: 400 });
  }
}
