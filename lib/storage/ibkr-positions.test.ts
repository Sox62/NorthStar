import assert from "node:assert/strict";
import test from "node:test";
import type { IbkrFlexReport, IbkrOpenPosition, ImportedTransaction } from "@/lib/integrations/types";
import { resolveIbkrCurrentPositions } from "./ibkr-positions";

function openPosition(input: Partial<IbkrOpenPosition> & Pick<IbkrOpenPosition, "instrumentKey" | "symbol" | "quantity" | "asOfDate">): IbkrOpenPosition {
  return {
    externalAccountId: "U123",
    description: input.symbol,
    exchange: "NASDAQ",
    currency: "USD",
    lastPrice: 10,
    fxRateToBase: 1.5,
    averageCostAud: 12,
    costAud: 1200,
    marketValueAud: 1500,
    pnlAud: 300,
    pnlPercent: 25,
    ...input,
  };
}

function trade(input: Partial<ImportedTransaction> & Pick<ImportedTransaction, "externalId" | "symbol" | "type" | "quantity" | "tradeDate">): ImportedTransaction {
  const price = input.price ?? 20;
  return {
    externalAccountId: "U123",
    exchange: "NASDAQ",
    description: input.symbol,
    instrumentKey: input.symbol,
    currency: "USD",
    price,
    cost: input.cost ?? Math.abs(input.quantity ?? 0) * price,
    fxRateToBase: 1.5,
    source: "IBKR Flex",
    ...input,
  };
}

function report(input: Partial<IbkrFlexReport>): IbkrFlexReport {
  return {
    accountId: "U123",
    fromDate: "2026-07-20",
    toDate: "2026-07-21",
    transactions: [],
    openPositions: [],
    cash: null,
    ...input,
  };
}

test("resolveIbkrCurrentPositions appends a same-day buy missing from the open-position snapshot", () => {
  const positions = resolveIbkrCurrentPositions(report({
    openPositions: [openPosition({ instrumentKey: "OLD", symbol: "OLD", quantity: 100, asOfDate: "2026-07-21" })],
    transactions: [trade({ externalId: "new-buy", symbol: "NEW", type: "BUY", quantity: 50, tradeDate: "2026-07-21" })],
  }));

  assert.deepEqual(positions.map((position) => position.symbol).sort(), ["NEW", "OLD"]);
  const added = positions.find((position) => position.symbol === "NEW");
  assert.equal(added?.quantity, 50);
  assert.equal(added?.source, "IBKR Flex Trades");
  assert.equal(added?.valuationBasis, "cost_basis");
});

test("resolveIbkrCurrentPositions overlays later buys onto an existing open position", () => {
  const positions = resolveIbkrCurrentPositions(report({
    openPositions: [openPosition({ instrumentKey: "OLD", symbol: "OLD", quantity: 100, asOfDate: "2026-07-20" })],
    transactions: [trade({ externalId: "add-buy", symbol: "OLD", type: "BUY", quantity: 25, tradeDate: "2026-07-21" })],
  }));

  assert.equal(positions.length, 1);
  assert.equal(positions[0].symbol, "OLD");
  assert.equal(positions[0].quantity, 125);
  assert.equal(positions[0].costAud, 1950);
  assert.equal(positions[0].marketValueAud, 2250);
  assert.equal(positions[0].source, "IBKR Open Positions + Trades");
});

test("resolveIbkrCurrentPositions ignores older trades already reflected in open positions", () => {
  const positions = resolveIbkrCurrentPositions(report({
    openPositions: [openPosition({ instrumentKey: "OLD", symbol: "OLD", quantity: 100, asOfDate: "2026-07-21" })],
    transactions: [trade({ externalId: "old-buy", symbol: "OLD", type: "BUY", quantity: 25, tradeDate: "2026-07-20" })],
  }));

  assert.equal(positions.length, 1);
  assert.equal(positions[0].quantity, 100);
  assert.equal(positions[0].source, "IBKR Open Positions");
});
