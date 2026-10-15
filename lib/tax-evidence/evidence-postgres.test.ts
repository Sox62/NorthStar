import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresStorageAdapter } from "@/lib/storage/postgres";
import { parseBankEvidenceCsv } from "./bank-csv";
import { parseIbkrFlexXml } from "@/lib/integrations/ibkr";
import { externalFxImport, readExternalFx } from "./external-fx";
import { evidenceDocument } from "./sources";
import type { EvidenceSourceInput } from "./types";

test("PostgreSQL bank and IBKR evidence ingestion is atomic without writing valuations or orders", async () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousPool = globalThis.__northStarPool;
  process.env.DATABASE_URL = "postgresql://synthetic-unused/test";
  const calls: string[] = [];
  let fail = false;
  const client = {
    release() {},
    async query(sql: string) {
      calls.push(sql);
      if (fail && sql.includes("INSERT INTO transactions")) throw new Error("Synthetic insert failure");
      if (/INSERT INTO (portfolio_groups|portfolios|broker_accounts)/.test(sql)) return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  globalThis.__northStarPool = { connect: async () => client } as unknown as Pool;
  try {
    const input = parseBankEvidenceCsv(Buffer.from("Date,Description,Amount,Reference\n2026-10-01,Test,100,R1"), {
      system: "Westpac", accountKey: "SYNTH", currency: "USD", filename: "source.csv", startDate: "2026-07-01", endDate: "2027-06-30",
    });
    const storage = new PostgresStorageAdapter();
    const ibkr = parseIbkrFlexXml(`<FlexQueryResponse><FlexStatements><FlexStatement accountId="SYNTH" fromDate="20260701" toDate="20270630">
      <CashTransactions><CashTransaction transactionID="synthetic-cash" dateTime="20261001;090000" type="Deposits/Withdrawals" currency="USD" amount="100"/></CashTransactions>
      <CashReport><CashReportCurrency currency="USD" levelOfDetail="Currency" startingCash="0" endingCash="100"/></CashReport>
      </FlexStatement></FlexStatements></FlexQueryResponse>`);
    for (const ingest of [() => storage.importTaxEvidence(input, "PERSONAL"), () => storage.importIbkr(ibkr, "PERSONAL", { evidenceOnly: true })]) {
      fail = false; calls.length = 0;
      assert.equal((await ingest()).imported, 1);
      assert.ok(calls.some((sql) => sql.includes("INSERT INTO tax_evidence_sources")));
      assert.equal(calls.at(-1), "COMMIT");
      assert.ok(!calls.some((sql) => /current_positions|cash_accounts|portfolio_snapshots|open_orders/.test(sql)));
      fail = true; calls.length = 0;
      await assert.rejects(ingest, /Synthetic insert failure/);
      assert.equal(calls.at(-1), "ROLLBACK");
      assert.ok(!calls.includes("COMMIT"));
    }
  } finally {
    globalThis.__northStarPool = previousPool;
    if (previousUrl == null) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
  }
});

test("PostgreSQL external FX declarations and supporting originals commit together without ledger entries", async () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousPool = globalThis.__northStarPool;
  process.env.DATABASE_URL = "postgresql://synthetic-unused/test";
  const calls: string[] = [];
  let failSupportingFile = false;
  const client = { release() {}, async query(sql: string, values?: unknown[]) {
    calls.push(sql);
    if (failSupportingFile && sql.includes("INSERT INTO tax_evidence_sources") && values?.[4] === "support.txt") throw new Error("Synthetic supporting-file failure");
    if (/INSERT INTO (portfolio_groups|portfolios|broker_accounts)/.test(sql)) return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  } };
  globalThis.__northStarPool = { connect: async () => client } as unknown as Pool;
  try {
    const declaration = readExternalFx({ provider: "Test FX", month: "2026-08", fromCurrency: "USD", fromAmount: 20, toCurrency: "AUD", toAmount: 30, note: "User-reported synthetic amounts." }, "Test");
    const supporting: EvidenceSourceInput = { system: "External FX", accountKey: "SYNTH", filename: "support.txt", mediaType: "text/plain", contentBase64: Buffer.from("Synthetic source").toString("base64"), startDate: "2026-08-01", endDate: "2026-08-31", metadata: { sections: ["Supporting document"] } };
    const input = externalFxImport(declaration, "SYNTH", [evidenceDocument(supporting, "PERSONAL").id], [supporting]);
    const storage = new PostgresStorageAdapter();
    assert.equal((await storage.importTaxEvidence(input, "PERSONAL")).imported, 0);
    assert.equal(calls.filter((sql) => sql.includes("INSERT INTO tax_evidence_sources")).length, 2);
    assert.equal(calls.at(-1), "COMMIT");
    assert.ok(!calls.some((sql) => /INSERT INTO transactions|current_positions|cash_accounts|portfolio_snapshots/.test(sql)));
    calls.length = 0; failSupportingFile = true;
    await assert.rejects(() => storage.importTaxEvidence(input, "PERSONAL"), /supporting-file failure/);
    assert.equal(calls.at(-1), "ROLLBACK"); assert.ok(!calls.includes("COMMIT"));
  } finally {
    globalThis.__northStarPool = previousPool;
    if (previousUrl == null) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
  }
});

test("PostgreSQL bank cash rows retain their descriptions and currency identity without a security instrument", async () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousPool = globalThis.__northStarPool;
  process.env.DATABASE_URL = "postgresql://synthetic-unused/test";
  globalThis.__northStarPool = { query: async () => ({ rows: [
    { id: "cash-one", legal_owner_type: "PERSONAL", broker: "Westpac", external_account_id: "SYNTH", external_id: "one", trade_date: "2026-08-06", type: "CASH_ACTIVITY", currency: "USD", net_cash: "-1200", source: "Westpac Statement", raw: { _evidenceDescription: "Synthetic provider withdrawal", _evidenceSymbol: "USD" } },
    { id: "cash-two", legal_owner_type: "PERSONAL", broker: "Westpac", external_account_id: "SYNTH", external_id: "two", trade_date: "2026-08-07", type: "CASH_ACTIVITY", currency: "USD", net_cash: "-100", source: "Westpac Statement", raw: { Description: "Legacy CSV description" } },
  ] }) } as unknown as Pool;
  try {
    const rows = await new PostgresStorageAdapter().listTransactions("PERSONAL");
    assert.deepEqual(rows.map((row) => [row.symbol, row.description]), [["USD", "Synthetic provider withdrawal"], ["USD", "Legacy CSV description"]]);
  } finally {
    globalThis.__northStarPool = previousPool;
    if (previousUrl == null) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
  }
});

test("PostgreSQL FX receipt reviews lock, validate and retain reversible cross-currency links", async () => {
  const previousUrl = process.env.DATABASE_URL; const previousPool = globalThis.__northStarPool;
  process.env.DATABASE_URL = "postgresql://synthetic-unused/test";
  const outgoing = "00000000-0000-4000-8000-000000000001", incoming = "00000000-0000-4000-8000-000000000002";
  const source = evidenceDocument(externalFxImport(readExternalFx({ provider: "Test FX", month: "2026-10", fromCurrency: "USD", fromAmount: 20,
    toCurrency: "AUD", toAmount: 30, fundingTransactionId: outgoing, note: "Synthetic declaration." }, "Test"), "SYNTH-FX", []).source, "PERSONAL");
  const history: Record<string, unknown>[] = []; const calls: string[] = []; let credit = 31;
  const client = { release() {}, async query(sql: string, values?: unknown[]) {
    calls.push(sql);
    if (sql.includes("FROM transactions t")) return { rows: [
      { id: outgoing, type: "CASH_ACTIVITY", net_cash: "-20", currency: "USD", legal_owner_type: "PERSONAL", broker: "Westpac", external_account_id: "SYNTH-USD" },
      { id: incoming, type: "CASH_ACTIVITY", net_cash: String(credit), currency: "AUD", legal_owner_type: "PERSONAL", broker: "Macquarie", external_account_id: "SYNTH-AUD" },
    ] };
    if (sql.includes("FROM tax_evidence_reviews")) return { rows: history };
    if (sql.includes("FROM tax_evidence_sources")) return { rows: [{ ...source, account_key: source.accountKey, start_date: source.startDate, end_date: source.endDate, imported_at: source.importedAt, legal_owner_type: "PERSONAL" }] };
    if (/INSERT INTO (portfolio_groups|portfolios)/.test(sql)) return { rows: [{ id: outgoing }], rowCount: 1 };
    if (sql.includes("INSERT INTO tax_evidence_reviews")) {
      const row = { id: `00000000-0000-4000-8000-00000000000${history.length + 3}`, outgoing_id: values![1], incoming_id: values![2], action: values![3], note: values![4], author: values![5], legal_owner_type: values![6], created_at: `2026-10-15T01:00:0${history.length}Z` };
      history.push(row); return { rows: [row], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  } };
  globalThis.__northStarPool = { connect: async () => client } as unknown as Pool;
  try {
    const storage = new PostgresStorageAdapter();
    const input = { ownerType: "PERSONAL" as const, outgoingId: outgoing, incomingId: incoming, externalFxId: source.id, action: "match" as const, note: "Synthetic bank receipt agrees.", author: "Test" };
    await assert.rejects(() => storage.recordEvidenceReview(input), /payout currency and amount/);
    assert.equal(calls.at(-1), "ROLLBACK"); assert.equal(history.length, 0);
    credit = 30; calls.length = 0;
    const saved = await storage.recordEvidenceReview(input);
    assert.equal(saved.externalFxId, source.id); assert.equal(saved.note, input.note); assert.equal(calls.at(-1), "COMMIT");
    assert.ok(calls.findIndex((sql) => sql.includes("pg_advisory_xact_lock")) < calls.findIndex((sql) => sql.includes("FROM transactions")));
    await assert.rejects(() => storage.recordEvidenceReview(input), /already matched/);
    const undo = await storage.recordEvidenceReview({ ...input, action: "unmatch", note: "Undo review, preserve original." });
    assert.equal(undo.externalFxId, source.id); assert.equal(history.length, 2);
    assert.ok(!calls.some((sql) => /UPDATE transactions|INSERT INTO transactions|current_positions|cash_accounts|portfolio_snapshots/.test(sql)));
  } finally {
    globalThis.__northStarPool = previousPool;
    if (previousUrl == null) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
  }
});
