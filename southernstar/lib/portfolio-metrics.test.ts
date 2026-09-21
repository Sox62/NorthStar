import assert from "node:assert/strict";
import test from "node:test";
import { rollupHoldingsByTicker } from "./portfolio-metrics";
import type { Holding } from "../types";

function holding(input: Partial<Holding> & Pick<Holding, "id" | "symbol" | "marketValueAud" | "costAud" | "pnlAud">): Holding {
  return {
    name: input.symbol,
    ownerType: "SMSF",
    sector: "Uranium miners",
    units: 100,
    pnlPercent: input.costAud ? input.pnlAud / input.costAud * 100 : 0,
    valuationBasis: "market",
    ...input,
  };
}

test("rollupHoldingsByTicker collapses duplicate sector tickers into one display row", () => {
  const rows = rollupHoldingsByTicker([
    holding({ id: "smsf-bmn", symbol: "BMN", name: "Bannerman Energy", ownerType: "SMSF", units: 1000, costAud: 1000, marketValueAud: 1400, pnlAud: 400 }),
    holding({ id: "personal-bmn", symbol: "bmn", name: "Bannerman Energy", ownerType: "PERSONAL", units: 500, costAud: 500, marketValueAud: 700, pnlAud: 200 }),
    holding({ id: "pdn", symbol: "PDN", name: "Paladin Energy", ownerType: "SMSF", units: 300, costAud: 600, marketValueAud: 900, pnlAud: 300 }),
  ]);

  const bmn = rows.find((row) => row.symbol === "BMN");
  assert.equal(rows.length, 2);
  assert.equal(bmn?.positionCount, 2);
  assert.equal(bmn?.ownerLabel, "Personal + SMSF");
  assert.equal(bmn?.units, 1500);
  assert.equal(bmn?.costAud, 1500);
  assert.equal(bmn?.marketValueAud, 2100);
  assert.equal(bmn?.pnlAud, 600);
  assert.equal(bmn?.pnlPercent, 40);
  assert.equal(bmn?.chartHolding.id, "smsf-bmn");
});

test("rollupHoldingsByTicker keeps the same ticker separate when the sector differs", () => {
  const rows = rollupHoldingsByTicker([
    holding({ id: "coal-smr", symbol: "SMR", name: "Stanmore Resources", sector: "Coal", costAud: 1000, marketValueAud: 1200, pnlAud: 200 }),
    holding({ id: "uranium-smr", symbol: "SMR", name: "NuScale Power", sector: "Uranium miners", costAud: 1000, marketValueAud: 900, pnlAud: -100 }),
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.sector).sort(), ["Coal", "Uranium miners"]);
});

test("rollupHoldingsByTicker uses canonical names for stale imported labels", () => {
  const rows = rollupHoldingsByTicker([
    holding({ id: "hl", symbol: "HL", name: "HL", sector: "Silver miners", costAud: 1000, marketValueAud: 1200, pnlAud: 200 }),
  ]);

  assert.equal(rows[0]?.name, "Hecla Mining Company");
});
