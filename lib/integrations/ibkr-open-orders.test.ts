import assert from "node:assert/strict";
import test from "node:test";
import { normaliseIbkrOpenOrder } from "./ibkr-open-orders";

test("normaliseIbkrOpenOrder maps submitted stop-limit order fields", () => {
  const order = normaliseIbkrOpenOrder({
    acct: "U1234567",
    conid: 123,
    orderId: 1267052741,
    cashCcy: "AUD",
    orderDesc: "Buy 2,500 STO ASX Stop Limit 8.50",
    description1: "STO",
    ticker: "STO",
    companyName: "SANTOS LIMITED",
    remainingQuantity: 2500,
    filledQuantity: 0,
    totalSize: 2500,
    status: "Submitted",
    orderType: "Stop Limit",
    timeInForce: "GTC",
    price: "8.50",
    auxPrice: "8.40",
    side: "BUY",
  });

  assert.equal(order.account, "U1234567");
  assert.equal(order.orderId, "1267052741");
  assert.equal(order.symbol, "STO");
  assert.equal(order.side, "BUY");
  assert.equal(order.status, "Submitted");
  assert.equal(order.orderType, "Stop Limit");
  assert.equal(order.timeInForce, "GTC");
  assert.equal(order.currency, "AUD");
  assert.equal(order.remainingQuantity, 2500);
  assert.equal(order.filledQuantity, 0);
  assert.equal(order.totalQuantity, 2500);
  assert.equal(order.limitPrice, 8.5);
  assert.equal(order.stopPrice, 8.4);
});
