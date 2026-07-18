import assert from "node:assert/strict";
import test from "node:test";
import { parseDirectsharesConfirmationText, parseDirectsharesHoldingsCsv } from "./directshares";

test("parseDirectsharesConfirmationText extracts a sell contract note", () => {
  const transaction = parseDirectsharesConfirmationText(`
SELL CONFIRMATION
4317403
Trade Date 16/06/2026
Settlement Date 18/06/2026
38478183
GDX
VanEck Gold Miners ETF
240 $29,928.00
124.700
Net Proceeds: (AUD) $29,895.00
`);

  assert.equal(transaction.externalId, "Directshares:38478183");
  assert.equal(transaction.externalAccountId, "4317403");
  assert.equal(transaction.type, "SELL");
  assert.equal(transaction.symbol, "GDX");
  assert.equal(transaction.exchange, "ASX");
  assert.equal(transaction.tradeDate, "2026-06-16");
  assert.equal(transaction.settleDate, "2026-06-18");
  assert.equal(transaction.quantity, -240);
  assert.equal(transaction.cost, -29928);
  assert.equal(transaction.netCash, 29895);
  assert.equal(transaction.fees, 33);
});

test("parseDirectsharesHoldingsCsv maps market suffixes and numeric fields", () => {
  const [position] = parseDirectsharesHoldingsCsv(`Account Number,Account Name,Code,Units Held,Last,FX Rate,Net Avg Price AUD,Cost AUD,Market Value AUD,Day Gain AUD,P&L AUD,P&L %
4317403,Stephen,SVM:CA,"3,500",19.2,1.11,8.5,29750,74592,-1200,44842,150.7
`);

  assert.equal(position.symbol, "SVM");
  assert.equal(position.exchange, "TSX/TSXV");
  assert.equal(position.currency, "CAD");
  assert.equal(position.quantity, 3500);
  assert.equal(position.marketValueAud, 74592);
});
