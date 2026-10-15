import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * The store falls back to the legacy data file when the configured one is absent, so a temp path
 * does not fully isolate it. These tests therefore assert on the seeded rows by external id rather
 * than on totals, which is the real contract anyway: the wrong copy goes, the right one stays.
 */
process.env.NORTH_STAR_DATA_FILE = join(mkdtempSync(join(tmpdir(), "ss-delete-")), "data.json");

const dividend = (externalId: string, symbol: string, netCash: number) => ({
  externalId,
  tradeDate: "2026-06-10",
  symbol,
  exchange: "ASX",
  type: "DIVIDEND" as const,
  currency: "AUD",
  netCash,
  source: "Dividend Statements",
});

const SEEDED_IDS = ["Dividend:REF-1", "Dividend:REF-2"];

/** How many of the seeded dividends survive in one book. */
async function idsFor(storage: { listTransactions: (owner: "PERSONAL" | "SMSF") => Promise<Array<{ externalId: string }>> }, owner: "PERSONAL" | "SMSF") {
  const rows = await storage.listTransactions(owner);
  return rows.filter((row) => SEEDED_IDS.includes(row.externalId)).length;
}

async function seeded() {
  // One store is shared across the suite, so each test starts by clearing it rather than
  // inheriting whatever the previous one left behind.
  const { LocalStorageAdapter } = await import("./local");
  const storage = new LocalStorageAdapter();
  // Clear any surviving copies from an earlier test before re-seeding both books.
  for (const owner of ["PERSONAL", "SMSF"] as const) {
    await storage.deleteTransactions({ ownerType: owner, externalIds: SEEDED_IDS });
  }
  // The real shape of the defect: one statement imported into both legal books.
  await storage.importDirectsharesTransactions(
    [dividend("Dividend:REF-1", "CDE", 55.55), dividend("Dividend:REF-2", "HL", 4.53)] as never,
    "PERSONAL",
    "Dividend Statements",
  );
  await storage.importDirectsharesTransactions(
    [dividend("Dividend:REF-1", "CDE", 55.55), dividend("Dividend:REF-2", "HL", 4.53)] as never,
    "SMSF",
    "Dividend Statements",
  );
  return storage;
}

test("a dry run reports the rows and changes nothing", async () => {
  const storage = await seeded();
  const result = await storage.deleteTransactions({
    ownerType: "SMSF",
    externalIds: ["Dividend:REF-1", "Dividend:REF-2"],
    dryRun: true,
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.deleted, 0);
  assert.equal(result.matched.length, 2);
  assert.equal(await idsFor(storage, "SMSF"), 2, "nothing removed on a dry run");
});

test("the delete takes the named book only, leaving the correct copy", async () => {
  // The whole point: both books hold the same external ids, and only one copy is wrong.
  const storage = await seeded();
  const result = await storage.deleteTransactions({
    ownerType: "SMSF",
    externalIds: ["Dividend:REF-1", "Dividend:REF-2"],
  });
  assert.equal(result.deleted, 2);
  assert.equal(await idsFor(storage, "SMSF"), 0, "both SMSF copies removed");
  assert.equal(await idsFor(storage, "PERSONAL"), 2, "the Personal copy must survive");
});

test("the source filter stops a mistyped id reaching another importer's row", async () => {
  const storage = await seeded();
  const result = await storage.deleteTransactions({
    ownerType: "SMSF",
    externalIds: ["Dividend:REF-1"],
    source: "Directshares All Trades Report",
  });
  assert.equal(result.deleted, 0, "the id exists but under a different source");
  assert.equal(await idsFor(storage, "SMSF"), 2);
});

test("an unknown id removes nothing rather than falling back to something broader", async () => {
  const storage = await seeded();
  const result = await storage.deleteTransactions({ ownerType: "SMSF", externalIds: ["Dividend:NOPE"] });
  assert.equal(result.deleted, 0);
  assert.deepEqual(result.matched, []);
  assert.equal(await idsFor(storage, "SMSF"), 2);
});

test("an empty id list is a no-op, never a wildcard", async () => {
  const storage = await seeded();
  const result = await storage.deleteTransactions({ ownerType: "SMSF", externalIds: [] });
  assert.equal(result.deleted, 0);
  assert.equal(await idsFor(storage, "SMSF"), 2);
  assert.equal(await idsFor(storage, "PERSONAL"), 2);
});

test("a re-import that changed a figure is reported, not counted as a repeat", async () => {
  /*
   * An amendment keeps the broker's identifier, so it arrives looking exactly like a re-import. It
   * was discarded as a duplicate, leaving the superseded figure in place with nothing to say the
   * source had changed its mind.
   */
  const { importConflicts } = await import("./import-conflicts");
  const stored = { externalId: "T-1", symbol: "BHP", tradeDate: "2026-06-10", cost: 100, quantity: 10, fees: 5 };
  const incoming = { tradeDate: "2026-06-10", cost: 100, quantity: 10, fees: 5 };

  assert.deepEqual(importConflicts(stored as never, incoming), [], "an exact repeat is a duplicate");
  assert.deepEqual(importConflicts(stored as never, { cost: 100 }), [], "a field the source does not state is not a change");

  const amended = importConflicts(stored as never, { ...incoming, cost: 150 });
  assert.equal(amended.length, 1);
  assert.deepEqual(
    { field: amended[0].field, stored: amended[0].stored, incoming: amended[0].incoming },
    { field: "cost", stored: "100", incoming: "150" },
  );

  // Floating-point round-tripping through a store must not read as an amendment.
  assert.deepEqual(importConflicts(stored as never, { ...incoming, cost: 100.0000001 }), []);
});
