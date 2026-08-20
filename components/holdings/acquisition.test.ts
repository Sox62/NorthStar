import assert from "node:assert/strict";
import test from "node:test";
import { acquisitionsByHolding, heldDays, heldLabel, ownerSymbolKey } from "./acquisition";

const lot = (id: string, ownerType: string, symbol: string, acquisitionDate: string | null, quantity = 100) =>
  ({ id, ownerType, symbol, acquisitionDate, quantity });

test("a position is dated by its earliest open lot", () => {
  // 93 open lots across the book means most holdings were built from several buys. The date that
  // matters for "how long have I held this" is the first one still open, not the most recent.
  const { byId } = acquisitionsByHolding([
    lot("h1:a", "SMSF", "NEM", "2024-03-11"),
    lot("h1:b", "SMSF", "NEM", "2023-07-02"),
    lot("h1:c", "SMSF", "NEM", "2025-01-20"),
  ]);
  assert.equal(byId.get("h1")?.firstAcquired, "2023-07-02");
  assert.equal(byId.get("h1")?.lots, 3);
});

test("the same ticker in two legal books stays two positions", () => {
  // NEM in the SMSF and NEM personally were bought on different days at different prices; merging
  // them on symbol alone would date one of them wrongly.
  const { byId, byOwnerSymbol } = acquisitionsByHolding([
    lot("smsf-nem:a", "SMSF", "NEM", "2023-07-02"),
    lot("personal-nem:a", "PERSONAL", "NEM", "2025-05-19"),
  ]);
  assert.equal(byId.get("smsf-nem")?.firstAcquired, "2023-07-02");
  assert.equal(byId.get("personal-nem")?.firstAcquired, "2025-05-19");
  assert.equal(byOwnerSymbol.get(ownerSymbolKey("SMSF", "NEM"))?.firstAcquired, "2023-07-02");
  assert.equal(byOwnerSymbol.get(ownerSymbolKey("personal", "nem"))?.firstAcquired, "2025-05-19");
});

test("undated fallback lots are counted but never date the holding", () => {
  // The 13 Directshares and physical lots have no acquisition history. Dating them "today" would
  // silently claim a holding fails the twelve-month CGT discount test.
  const { byId } = acquisitionsByHolding([
    lot("h2:a", "PERSONAL", "AYA", null),
    lot("h2:b", "PERSONAL", "AYA", null),
  ]);
  assert.equal(byId.get("h2")?.firstAcquired, "");
  assert.equal(byId.get("h2")?.lots, 2);
});

test("a dated lot still dates a holding that also has undated ones", () => {
  const { byId } = acquisitionsByHolding([
    lot("h3:a", "PERSONAL", "CDE", null),
    lot("h3:b", "PERSONAL", "CDE", "2024-11-04"),
  ]);
  assert.equal(byId.get("h3")?.firstAcquired, "2024-11-04");
  assert.equal(byId.get("h3")?.lots, 2);
});

test("a lot id with no holding prefix is skipped rather than keyed on empty", () => {
  const { byId } = acquisitionsByHolding([lot("nocolon", "PERSONAL", "X", "2024-01-01")]);
  assert.equal(byId.size, 0);
});

test("held duration reads in years once there is a year to read", () => {
  const now = new Date("2026-08-20T00:00:00.000Z");
  assert.equal(heldDays("2026-08-10", now), 10);
  assert.equal(heldLabel("2026-08-18", now), "2 days held");
  assert.equal(heldLabel("2026-05-20", now), "3 mo held");
  assert.equal(heldLabel("2023-07-02", now), "3.1 yr held");
  assert.equal(heldLabel("", now), "");
});

test("a future or unparseable date yields no duration rather than a negative one", () => {
  const now = new Date("2026-08-20T00:00:00.000Z");
  assert.equal(heldDays("2027-01-01", now), null);
  assert.equal(heldDays("not a date", now), null);
});
