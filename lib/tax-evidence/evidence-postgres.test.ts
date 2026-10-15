import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresStorageAdapter } from "@/lib/storage/postgres";
import { parseBankEvidenceCsv } from "./bank-csv";
import { parseIbkrFlexXml } from "@/lib/integrations/ibkr";

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
