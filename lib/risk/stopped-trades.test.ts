import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brokerReportsStopExit, combineStopExitHistory, exitFromSale, recordStopExit, setStopExitExcluded, stopExitInput, stopExitsCsv, stoppedTradeHistory } from "./stopped-trades";
import type { StoredTransaction } from "@/lib/storage";

const sale = (overrides: Partial<StoredTransaction> = {}): StoredTransaction => ({
  id: "sell-1", externalId: "execution-1", ownerType: "PERSONAL", broker: "IBKR", accountKey: "account-1",
  symbol: "TEST", description: "Test company", exchange: "US", tradeDate: "2020-01-10", currency: "USD",
  type: "SELL", quantity: -25, price: 97, fees: 2, source: "IBKR Flex",
  raw: { orderType: "STP", openCloseIndicator: "C", stopPrice: "98", ibOrderID: "order-1", feeCurrency: "CAD" }, ...overrides,
});

test("automatic history requires an actual closing stop execution", () => {
  assert.equal(brokerReportsStopExit(sale()), true);
  for (const transaction of [
    sale({ raw: { orderType: "MKT", openCloseIndicator: "C" } }),
    sale({ raw: { orderType: "STP", openCloseIndicator: "O" } }),
    sale({ raw: { orderType: "STP" } }), sale({ type: "BUY" }), sale({ quantity: 0 }), sale({ price: NaN }),
    sale({ raw: { orderType: "STP", openCloseIndicator: "C", status: "Cancelled" } }),
    sale({ raw: { orderType: "STP", openCloseIndicator: "C", originalTradeID: "busted" } }),
  ]) assert.equal(brokerReportsStopExit(transaction), false);
  assert.equal(brokerReportsStopExit(sale({ raw: { OrderType: "TRAIL LMT", OpenCloseIndicator: "C" } })), true);
});

test("partial fills and legal owners remain distinct, while repeat imports do not duplicate exits", () => {
  const rows = [sale(), sale(), sale({ id: "sell-2", externalId: "execution-2", quantity: -10 }), sale({ id: "smsf-sale", ownerType: "SMSF" })];
  const history = combineStopExitHistory(rows, []);
  assert.equal(history.records.length, 3);
  assert.equal(combineStopExitHistory(rows, [], "SMSF").records.length, 1);
  assert.equal(history.records.find(r => r.transactionId === "sell-1")!.quantity, 25);
  assert.equal(history.records.find(r => r.transactionId === "sell-1")!.feeCurrency, "CAD");
});

test("review order is preserved when timestamps tie, and owner mismatches are refused", () => {
  const record = exitFromSale(sale());
  const revisions = [{ id: "z", ownerType: record.ownerType, record: { ...record, excluded: true }, recordedAt: "2020-01-11" },
    { id: "a", ownerType: record.ownerType, record, recordedAt: "2020-01-11" }];
  assert.equal(combineStopExitHistory([sale()], revisions).records[0].excluded, false);
  assert.throws(() => combineStopExitHistory([], [{ ...revisions[0], ownerType: "SMSF" }]), /owner mismatch/);
});

test("manual records validate real dates, positive fills and quantities", () => {
  const input = { mode: "manual", id: "2687aa2c-7055-4d40-a6d8-ab64881d150b", ownerType: "PERSONAL", broker: "IBKR", accountKey: "account-1", symbol: "TEST", currency: "USD", exitDate: "2020-01-10", quantity: 25, exitPrice: 97 };
  assert.equal(stopExitInput.safeParse(input).success, true);
  for (const change of [{ exitDate: "2020-02-31" }, { exitDate: "2099-01-01" }, { quantity: 0 }, { exitPrice: -1 }, { fees: -1 }]) {
    assert.equal(stopExitInput.safeParse({ ...input, ...change }).success, false);
  }
});

test("CSV preserves references and notes safely", () => {
  const csv = stopExitsCsv([{ ...exitFromSale(sale()), notes: '=IMPORTDATA("unsafe")\nlesson' }]);
  assert.ok(csv.includes('"\'=IMPORTDATA(""unsafe"")\nlesson"'));
  assert.ok(csv.includes('"execution-1","order-1"'));
  assert.ok(csv.includes('"CAD"'));
});

test("linked and manual records persist after restart without posting a trade; corrections are append-only", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "ss-stop-history-")), "data.json");
  process.env.NORTH_STAR_DATA_FILE = file;
  const voluntary = sale({ raw: { orderType: "MKT" } });
  writeFileSync(file, JSON.stringify({ version: 7, transactions: [voluntary], positions: [], cashAccounts: [], manualAssets: [], snapshots: [], imports: [] }));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const storage = new LocalStorageAdapter();
  assert.equal((await stoppedTradeHistory(storage, "overall")).records.length, 0);
  await recordStopExit(storage, { mode: "sale", transactionId: voluntary.id, stopPrice: 98, notes: "Followed the stop" });
  await recordStopExit(storage, { mode: "sale", transactionId: voluntary.id, stopPrice: 98, notes: "Reviewed the fill" });
  let history = await stoppedTradeHistory(new LocalStorageAdapter(), "overall");
  assert.equal(history.records.length, 1);
  assert.equal(history.records[0].source, "USER_CONFIRMED");
  assert.equal(history.records[0].notes, "Reviewed the fill");
  await setStopExitExcluded(storage, history.records[0].id, true);
  assert.equal((await stoppedTradeHistory(storage, "overall")).records[0].excluded, true);
  await setStopExitExcluded(storage, history.records[0].id, false);
  const manual = { mode: "manual", id: "2687aa2c-7055-4d40-a6d8-ab64881d150b", ownerType: "SMSF", broker: "Directshares", accountKey: "smsf", symbol: "PAST", currency: "AUD", exitDate: "2020-01-10", quantity: 10, exitPrice: 3, notes: "Manual exit" };
  await recordStopExit(storage, manual); await recordStopExit(storage, manual);
  history = await stoppedTradeHistory(new LocalStorageAdapter(), "overall");
  assert.equal(history.records.length, 2);
  assert.equal((await stoppedTradeHistory(storage, "personal")).records.length, 1);
  assert.equal((await stoppedTradeHistory(storage, "smsf")).records.length, 1);
  const data = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(data.transactions, [voluntary]);
  assert.deepEqual(data.positions, []);
  assert.equal(data.stopExitRevisions.length, 5);
});
