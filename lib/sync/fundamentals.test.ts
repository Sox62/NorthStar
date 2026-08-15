import assert from "node:assert/strict";
import test from "node:test";
import { starterMinerFundamentals } from "@/lib/fundamentals/starter-records";
import type { MinerFundamentals, MinerFundamentalsInput, StorageAdapter } from "@/lib/storage";
import { syncSourcedFundamentals } from "./fundamentals";

function fakeStorage(saved: MinerFundamentals[]) {
  const writes: string[] = [];
  const storage = {
    listMinerFundamentals: async (symbols?: string[]) => symbols
      ? saved.filter((record) => symbols.map((item) => item.toUpperCase()).includes(record.symbol.toUpperCase()))
      : saved,
    upsertMinerFundamentals: async (input: MinerFundamentalsInput) => {
      writes.push(input.symbol);
      return { ...input, updatedAt: "2026-08-13T00:00:00.000Z" } as MinerFundamentals;
    },
    recordSyncRun: async () => undefined,
  } as unknown as StorageAdapter;
  return { storage, writes };
}

const savedRecord = (symbol: string): MinerFundamentals => ({
  ...starterMinerFundamentals[0],
  symbol,
  notes: "Hand-entered research",
  jurisdictionScore: 5,
  updatedAt: "2026-08-12T00:00:00.000Z",
});

test("the seed writes records that have never been saved", async () => {
  const { storage, writes } = fakeStorage([]);
  const result = await syncSourcedFundamentals(storage, "scheduled");

  assert.equal(result.status, "success");
  assert.deepEqual(writes, starterMinerFundamentals.map((record) => record.symbol));
  assert.equal(result.imported, starterMinerFundamentals.length);
  assert.deepEqual(result.preserved, []);
});

test("the seed never overwrites saved research", async () => {
  const target = starterMinerFundamentals[0].symbol;
  const { storage, writes } = fakeStorage([savedRecord(target)]);
  const result = await syncSourcedFundamentals(storage, "scheduled");

  assert.ok(!writes.includes(target), "a symbol with saved research must not be rewritten");
  assert.deepEqual(result.preserved, [target]);
  assert.equal(result.imported, starterMinerFundamentals.length - 1);
});

test("a fully researched book leaves the nightly sync with nothing to write", async () => {
  const { storage, writes } = fakeStorage(starterMinerFundamentals.map((record) => savedRecord(record.symbol)));
  const result = await syncSourcedFundamentals(storage, "scheduled");

  assert.deepEqual(writes, []);
  assert.equal(result.imported, 0);
  assert.match(result.message, /No sourced miner fundamentals needed seeding/);
});

test("every seeded symbol is still reported so callers can read the current records back", async () => {
  const { storage } = fakeStorage([savedRecord(starterMinerFundamentals[0].symbol)]);
  const result = await syncSourcedFundamentals(storage, "scheduled");

  assert.deepEqual(result.symbols, starterMinerFundamentals.map((record) => record.symbol));
});

test("symbol matching is case-insensitive", async () => {
  const target = starterMinerFundamentals[0].symbol;
  const { storage, writes } = fakeStorage([savedRecord(target.toLowerCase())]);
  await syncSourcedFundamentals(storage, "scheduled");

  assert.ok(!writes.includes(target));
});
