import { createHash } from "node:crypto";
import type { ImportedTransaction } from "@/lib/integrations/types";
import type { EvidenceBalance, EvidenceSourceInput } from "./types";

const array = (value: unknown): Record<string, unknown>[] => value == null ? [] : (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
const amount = (value: unknown) => value === "" || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const day = (value: unknown) => String(value ?? "").replace(/^(\d{4})(\d{2})(\d{2}).*$/, "$1-$2-$3").slice(0, 10);

/** Cash events are evidence only: they do not become dividends, positions or assumed tax income. */
export function ibkrCashActivity(statement: Record<string, unknown>, account: string): ImportedTransaction[] {
  const rows = array((statement.CashTransactions as Record<string, unknown> | undefined)?.CashTransaction);
  const occurrences = new Map<string, number>();
  return rows.map((raw, index) => {
    const value = amount(raw.amount);
    const date = day(raw.dateTime ?? raw.reportDate ?? raw.settleDate);
    const currency = String(raw.currency ?? "").toUpperCase();
    if (value == null || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || !/^[A-Z]{3}$/.test(currency)) {
      throw new Error(`Cash transaction ${index + 1} needs a valid amount, currency and date. No rows were imported.`);
    }
    const key = String(raw.transactionID ?? raw.transactionId ?? "");
    const composite = createHash("sha256").update(JSON.stringify([account, date, raw.dateTime, currency, value, raw.type, raw.description, raw.tradeID])).digest("hex");
    const occurrence = (occurrences.get(composite) ?? 0) + 1;
    occurrences.set(composite, occurrence);
    return {
      externalId: key ? `IBKR-CASH:${key}` : `IBKR-CASH:${composite}:${occurrence}`,
      externalAccountId: String(raw.accountId ?? account), tradeDate: date,
      settleDate: raw.settleDate ? day(raw.settleDate) : undefined,
      symbol: String(raw.symbol ?? currency), exchange: "", description: String(raw.description ?? raw.type ?? "Cash activity"),
      type: "CASH_ACTIVITY", currency, netCash: value, source: "IBKR Cash Transactions",
      raw: { ...raw, _evidenceCategory: String(raw.type ?? "Cash activity"), _originalDate: String(raw.dateTime ?? raw.reportDate ?? raw.settleDate),
        _sourceIdQuality: key ? "broker_id" : "composite" },
    };
  });
}

export function ibkrSourceDocument(xml: string, statements: Record<string, unknown>[], account: string): EvidenceSourceInput {
  const balances: EvidenceBalance[] = [];
  const sections = new Set<string>();
  for (const statement of statements) {
    for (const [key, value] of Object.entries(statement)) {
      // An empty returned section is distinct from a section the query did not supply.
      if ((value && typeof value === "object") || ["Trades", "CashTransactions", "CashReport", "TradeConfirms"].includes(key)) sections.add(key);
    }
    for (const row of array((statement.CashReport as Record<string, unknown> | undefined)?.CashReportCurrency)) {
      const currency = String(row.currency ?? "").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency) || row.levelOfDetail === "BaseCurrency") continue;
      balances.push({ currency, startDate: day(row.fromDate ?? statement.fromDate), endDate: day(row.toDate ?? statement.toDate),
        opening: amount(row.startingCash), closing: amount(row.endingCash) });
    }
  }
  const dates = statements.flatMap((row) => [day(row.fromDate), day(row.toDate)]).filter(Boolean).sort();
  return {
    system: "IBKR", accountKey: account, filename: "IBKR_Flex.xml", mediaType: "application/xml", contentBase64: Buffer.from(xml, "utf8").toString("base64"),
    startDate: dates[0] ?? "0001-01-01", endDate: dates.at(-1) ?? "9999-12-31",
    metadata: { sections: [...sections].sort(), balances, timezone: String(statements[0]?.timeZone ?? statements[0]?.timezone ?? "") || null },
  };
}
