import { NextResponse } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const inputSchema = z.object({
  ownerType: z.enum(["PERSONAL", "SMSF"]),
  externalIds: z.array(z.string().min(1)).min(1).max(200),
  source: z.string().min(1).optional(),
  commit: z.boolean().optional(),
});

const listSchema = z.object({
  ownerType: z.enum(["PERSONAL", "SMSF"]),
  source: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
});

/**
 * Lists transactions with their external ids, which is how a delete names its rows.
 *
 * Nothing else exposes an external id, so without this the delete below could only be driven by
 * ids guessed from a statement — and a guessed id either misses or, worse, matches something else.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = listSchema.parse({
      ownerType: (url.searchParams.get("ownerType") || "").toUpperCase(),
      source: url.searchParams.get("source") || undefined,
      type: url.searchParams.get("type") || undefined,
    });
    const rows = await getStorage().listTransactions(input.ownerType);
    const filtered = rows.filter((row) =>
      (!input.source || row.source === input.source)
      && (!input.type || row.type === input.type));
    return NextResponse.json({
      ownerType: input.ownerType,
      count: filtered.length,
      transactions: filtered.slice(0, 500).map((row) => ({
        externalId: row.externalId,
        symbol: row.symbol,
        tradeDate: row.tradeDate,
        type: row.type,
        netCash: row.netCash ?? null,
        taxes: row.taxes ?? null,
        broker: row.broker,
        accountKey: row.accountKey,
        source: row.source,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to list transactions" },
      { status: 400 },
    );
  }
}

/**
 * Removes transactions that should never have been recorded — a statement imported against the
 * wrong legal book, which cannot be corrected by re-importing because the mistaken copy stays put.
 *
 * Deliberately narrow. Rows are named by external id rather than selected by owner and type, so a
 * request cannot sweep up a genuine payment that happens to share a source. Without `commit` it
 * reports what it matched and deletes nothing, which is the only way to see the blast radius
 * before taking it.
 */
export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const result = await getStorage().deleteTransactions({
      ownerType: input.ownerType,
      externalIds: input.externalIds,
      source: input.source,
      dryRun: !input.commit,
    });

    const missing = input.externalIds.filter((id) => !result.matched.some((row) => row.externalId === id));
    return NextResponse.json({
      ...result,
      requested: input.externalIds.length,
      // A caller that expected four rows and matched three has the wrong ids, not a partial success.
      unmatched: missing,
      message: result.dryRun
        ? `${result.matched.length} of ${input.externalIds.length} transactions would be removed from ${input.ownerType}. Nothing has changed.`
        : `${result.deleted} transaction${result.deleted === 1 ? "" : "s"} removed from ${input.ownerType}.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete transactions" },
      { status: 400 },
    );
  }
}
