import assert from "node:assert/strict";
import test from "node:test";
import { parseDirectsharesConfirmationCsv, parseDirectsharesConfirmationText, parseDirectsharesHoldingsCsv } from "./directshares";

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
  const [position, compactUs, compactCa] = parseDirectsharesHoldingsCsv(`Account Number,Account Name,Code,Units Held,Last,FX Rate,Net Avg Price AUD,Cost AUD,Market Value AUD,Day Gain AUD,P&L AUD,P&L %
4317403,Stephen,SVM:CA,"3,500",19.2,1.11,8.5,29750,74592,-1200,44842,150.7
4317403,Stephen,CDEUS,500,12.5,1.52,11,5500,9500,100,4000,72.7
4317403,Stephen,LAMCA,1000,0.95,1.11,0.8,800,1054,10,254,31.8
`);

  assert.equal(position.symbol, "SVM");
  assert.equal(position.exchange, "TSX/TSXV");
  assert.equal(position.currency, "CAD");
  assert.equal(position.quantity, 3500);
  assert.equal(position.marketValueAud, 74592);
  assert.equal(compactUs.symbol, "CDE");
  assert.equal(compactUs.exchange, "US");
  assert.equal(compactUs.currency, "USD");
  assert.equal(compactCa.symbol, "LAM");
  assert.equal(compactCa.exchange, "TSX/TSXV");
  assert.equal(compactCa.currency, "CAD");
});

test("parseDirectsharesConfirmationCsv extracts bulk confirmations across accounts", () => {
  const transactions = parseDirectsharesConfirmationCsv(`Account Number,Account Name,AsxCode,Confirmation Number,Order Type,As at Date,Trade Date,Settlement Date,Avg Price,Exch Rate,Price,Quantity,Brokerage,GST,Stampduty,Application Fee,OtherCharge,Fee,Discount,Consideration,Reverse Confirmation Number
4317403,STEPHEN OXENBURY,SVM:CA,38483957,Sell,2026-06-16,2026-06-17,2026-06-17,"17.5000 CAD",1.003458,17.56050000,3500.000000000,362.62,0.00,0.00,0.00,0.00,0.00,0.00,61099.1300,0,
4386162,STEPHEN OXENBURY,U/UN:CA,34883208,Sell,2025-12-03,2025-12-04,2025-12-04,"25.2000 CAD",1.080427,27.22680000,500.000000000,80.32,0.00,0.00,0.00,0.00,0.00,0.00,13533.0800,0,
4386162,STEPHEN OXENBURY,ASL,32117247,Buy,,2025-07-14,2025-07-16,"1.3000 ",1.000000,1.30000000,17000.000000000,22.10,2.21,0.00,0.00,0.00,0.00,0.00,22124.3100,0,
`);

  assert.equal(transactions.length, 3);
  assert.deepEqual([...new Set(transactions.map((row) => row.externalAccountId))].sort(), ["4317403", "4386162"]);

  const svm = transactions[0];
  assert.equal(svm.externalId, "Directshares:38483957");
  assert.equal(svm.symbol, "SVM");
  assert.equal(svm.exchange, "TSX/TSXV");
  assert.equal(svm.tradeDate, "2026-06-17");
  assert.equal(svm.settleDate, "2026-06-17");
  assert.equal(svm.quantity, -3500);
  assert.equal(svm.cost, -61461.75);
  assert.equal(svm.netCash, 61099.13);
  assert.equal(svm.fees, 362.62);
  assert.equal(svm.currency, "AUD");

  const uranium = transactions[1];
  assert.equal(uranium.symbol, "U.UN");
  assert.equal(uranium.exchange, "TSX/TSXV");

  const asl = transactions[2];
  assert.equal(asl.type, "BUY");
  assert.equal(asl.tradeDate, "2025-07-14");
  assert.equal(asl.quantity, 17000);
  assert.equal(asl.cost, 22100);
  assert.equal(asl.netCash, -22124.31);
  assert.equal(asl.fees, 24.31);
});
