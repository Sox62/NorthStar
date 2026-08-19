import assert from "node:assert/strict";
import test from "node:test";
import { parseIbkrOrdersPayload } from "./ibkr-open-orders";

// Shaped exactly like a Client Portal /iserver/account/orders response.
const payload = JSON.stringify({
  orders: [
    { order_id: 1444748430, order_status: "NEW", order_type: "LIMIT", side: "BUY", limit_price: "5.5",
      total_shares_qty: "5000", remaining_shares_qty: "5000", ticker: "WGX", secondary_description: "Limit 5.500, GTC" },
    { order_id: 648789584, order_status: "REPLACED", order_type: "STOP", side: "SELL",
      total_shares_qty: "10000", remaining_shares_qty: "10000", ticker: "HSTR", auxPrice: "1.76" },
  ],
});

test("a whole Client Portal response parses", () => {
  const orders = parseIbkrOrdersPayload(payload);

  assert.equal(orders.length, 2);
  assert.equal(orders[0].symbol, "WGX");
  assert.equal(orders[0].side, "BUY");
  assert.equal(orders[0].limitPrice, 5.5);
  assert.equal(orders[0].totalQuantity, 5000);
  assert.equal(orders[0].status, "NEW");
  assert.equal(orders[1].stopPrice, 1.76, "auxPrice is the stop");
});

test("a bare array parses too, so it does not matter what was copied", () => {
  const bare = JSON.parse(payload).orders;
  assert.equal(parseIbkrOrdersPayload(JSON.stringify(bare)).length, 2);
});

test("empty and malformed input is rejected with a usable message", () => {
  assert.throws(() => parseIbkrOrdersPayload("   "), /Paste the order payload/);
  assert.throws(() => parseIbkrOrdersPayload("not json"), /not valid JSON/);
  assert.throws(() => parseIbkrOrdersPayload('{"foo":1}'), /No orders found/);
  assert.throws(() => parseIbkrOrdersPayload("[]"), /no recognisable orders/);
});

test("rows with neither a symbol nor an id are dropped rather than stored blank", () => {
  const messy = JSON.stringify({ orders: [{ ticker: "WGX", order_id: 1 }, {}, null, "junk", { note: "no id" }] });
  const orders = parseIbkrOrdersPayload(messy);

  assert.equal(orders.length, 1);
  assert.equal(orders[0].symbol, "WGX");
});

test("a stop with no price field takes it from the description", () => {
  // These orders carry no stop_price at all; "STP 1.760, GTC" is the only place it appears.
  const [order] = parseIbkrOrdersPayload(JSON.stringify({ orders: [{
    order_id: 885349105, order_status: "REPLACED", order_type: "STOP", side: "SELL",
    total_shares_qty: "6000", primary_description: "Sell 6000 BMN", secondary_description: "STP 3.000, GTC",
  }] }));

  assert.equal(order.symbol, "BMN", "symbol comes from the description when there is no ticker field");
  assert.equal(order.stopPrice, 3);
  assert.equal(order.totalQuantity, 6000);
});

test("a stop-limit carries both prices", () => {
  const [order] = parseIbkrOrdersPayload(JSON.stringify({ orders: [{
    order_id: 1267052741, order_type: "STOP_LIMIT", side: "BUY", limit_price: "8.5",
    total_shares_qty: "2500", primary_description: "Buy 2500 STO", secondary_description: "STP 8.400 LMT 8.500, GTC",
  }] }));

  assert.equal(order.stopPrice, 8.4);
  assert.equal(order.limitPrice, 8.5);
});

test("quantities and prices arrive as strings and come back as numbers", () => {
  const orders = parseIbkrOrdersPayload(payload);
  for (const order of orders) {
    assert.equal(typeof order.totalQuantity, "number");
    if (order.limitPrice !== null) assert.equal(typeof order.limitPrice, "number");
  }
});

test("order type and tenor survive the snake_case payload", () => {
  const [stop, limit] = parseIbkrOrdersPayload(JSON.stringify({ orders: [
    { order_id: 1, order_type: "STOP", side: "SELL", total_shares_qty: "6000",
      primary_description: "Sell 6000 BMN", secondary_description: "STP 3.000, GTC" },
    { order_id: 2, order_type: "LIMIT", side: "BUY", limit_price: "5.5", total_shares_qty: "5000",
      primary_description: "Buy 5000 WGX", secondary_description: "Limit 5.500, GTC" },
  ] }));

  assert.equal(stop.orderType, "STOP", "without this the UI cannot tell a stop from a target");
  assert.equal(stop.timeInForce, "GTC");
  assert.equal(limit.orderType, "LIMIT");
});
