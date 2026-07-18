import assert from "node:assert/strict";
import test from "node:test";
import { parseDirectsharesDividendText, parseDividendCsv } from "./dividends";

test("parseDirectsharesDividendText extracts foreign income and AUD proceeds", () => {
  const transaction = parseDirectsharesDividendText(`
29 June 2026

MR STEPHEN OXENBURY

Account Number: 4317403
Account Name: STEPHEN OXENBURY
Dividend On: SVM:CA

Pay Date 25/06/2026
Ex Date 05/06/2026
Holdings as at Ex Date 3500 shares
Gross Dividend Rate USD 0.0124993
Gross Amount USD 43.75
Fees USD 0.00
Tax Withheld USD 10.94
Net amount (Local) USD 32.81
Exchange Rate @ 0.69134
Net Amount (AUD) AUD 47.46
`, "SVM:CA Dividend - 4317403 STEPHEN OXENBURY Notification");

  assert.equal(transaction.externalAccountId, "4317403");
  assert.equal(transaction.symbol, "SVM");
  assert.equal(transaction.exchange, "TSX/TSXV");
  assert.equal(transaction.tradeDate, "2026-06-25");
  assert.equal(transaction.currency, "AUD");
  assert.equal(transaction.netCash, 47.46);
  assert.equal(transaction.raw?.exDate, "2026-06-05");
  assert.equal(transaction.raw?.shares, 3500);
  assert.equal(transaction.raw?.localCurrency, "USD");
  assert.equal(transaction.raw?.grossDividendLocal, 43.75);
  assert.equal(transaction.raw?.taxWithheldLocal, 10.94);
});

test("parseDividendCsv handles franked Australian dividend rows", () => {
  const [transaction] = parseDividendCsv(`Account,Symbol,Name,Exchange,Payment Date,Gross Dividend,Net Cash,Franking Credit,Withholding Tax,Shares,Reference
4317403,CBA,Commonwealth Bank,ASX,30/06/2026,100.00,100.00,42.86,0,50,CBA-2026
`);

  assert.equal(transaction.externalId, "Dividend:CBA-2026");
  assert.equal(transaction.symbol, "CBA");
  assert.equal(transaction.tradeDate, "2026-06-30");
  assert.equal(transaction.raw?.frankingCredit, 42.86);
  assert.equal(transaction.netCash, 100);
});
