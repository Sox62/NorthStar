import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeDirectsharesAllTrades, parseDirectsharesAllTradesCsv } from "./directshares-trades";

const HEADER = "Code,Market Code,Name,Date,Type,Qty,Price,Instrument Currency,Cost Base Per Share (aud),Brokerage,Brokerage Currency,Exch. Rate,Value,";

const report = (...rows: string[]) => [
  "All Trades Report for Account 12345,,,,,,,,,,,,,",
  HEADER,
  ...rows,
].join("\n");

/** Real rows from the export, kept verbatim so the arithmetic is checked against the source. */
const ASL_BUY = "ASL,ASX,Andean Silver Limited,2025-07-14,Buy,23486,1.45,AUD,,59,AUD,1,34113.7,";
const XOM_BUY = "XOM,NYSE,ExxonMobil Holdings Corp.,2026-01-15,Buy,100,131.80030014,USD,,116.05,AUD,0.670093559365865,19784.99,";
const XOM_SELL = "XOM,NYSE,ExxonMobil Holdings Corp.,2026-04-15,Sell,-100,148.5,USD,,122.14,AUD,1.3940809999999995,-20579.96,";
const AYA_BUY = "AYA,TSE,Aya Gold & Silver Inc,2025-07-16,Buy,2050,17.5,CAD,,125.76,AUD,0.89,40469.5,";
const VAU_CONSOLIDATION = "VAU,ASX,Vault Minerals Ltd,2025-11-26,Consolidation,-42307,,AUD,,,AUD,,,";

/** AUD out the door on a buy, AUD received on a sell, which the file states in its Value column. */
function audValue(transaction: { cost?: number; fxRateToBase?: number; fees?: number; type: string }) {
  const gross = (transaction.cost ?? 0) * (transaction.fxRateToBase ?? 1);
  return transaction.type === "BUY" ? gross + (transaction.fees ?? 0) : gross - (transaction.fees ?? 0);
}

test("the header row is found beneath the report title", () => {
  assert.equal(looksLikeDirectsharesAllTrades(report(ASL_BUY)), true);
  assert.equal(looksLikeDirectsharesAllTrades("Confirmation Number,AsxCode,Order Type,Consideration\n1,BHP,Buy,100"), false);
  assert.equal(looksLikeDirectsharesAllTrades(""), false);
});

test("an AUD trade carries its date, quantity and cost", () => {
  const [trade] = parseDirectsharesAllTradesCsv(report(ASL_BUY));
  assert.equal(trade.tradeDate, "2025-07-14");
  assert.equal(trade.symbol, "ASL");
  assert.equal(trade.type, "BUY");
  assert.equal(trade.quantity, 23486);
  assert.equal(trade.fees, 59);
  assert.equal(trade.fxRateToBase, 1);
  assert.equal(audValue(trade).toFixed(2), "34113.70", "reproduces the file's own Value column");
});

test("the exchange rate is read in whichever direction the row quotes it", () => {
  // The report does not keep one convention. ExxonMobil's buy quotes USD per AUD at 0.670094 and
  // its sell quotes AUD per USD at 1.394081. Applying either rule to both rows misprices the
  // position by more than half, so the rate is derived from the stated AUD value instead.
  const [buy, sell] = parseDirectsharesAllTradesCsv(report(XOM_BUY, XOM_SELL));
  assert.equal(audValue(buy).toFixed(2), "19784.99");
  assert.equal(audValue(sell).toFixed(2), "20579.96");
  assert.ok(buy.fxRateToBase! > 1.4 && buy.fxRateToBase! < 1.6, `buy rate ${buy.fxRateToBase} should be AUD per USD`);
  assert.ok(sell.fxRateToBase! > 1.3 && sell.fxRateToBase! < 1.5, `sell rate ${sell.fxRateToBase} should be AUD per USD`);
});

test("lots key onto positions the way the holdings importer spells them", () => {
  // A CGT lot joins a position through Directshares:SYMBOL:EXCHANGE. "NYSE" instead of "US" would
  // leave the holding undated with its trades sitting in storage, matching nothing.
  const trades = parseDirectsharesAllTradesCsv(report(ASL_BUY, XOM_BUY, AYA_BUY));
  assert.deepEqual(trades.map((trade) => trade.instrumentKey), [
    "Directshares:ASL:ASX",
    "Directshares:XOM:US",
    "Directshares:AYA:TSX/TSXV",
  ]);
});

test("a corporate action is not a trade", () => {
  // VAU appears as a "Consolidation" of -42,307 units with no price. Treated as a sale it would
  // invent a disposal, and FIFO would then match it against real lots.
  const trades = parseDirectsharesAllTradesCsv(report(ASL_BUY, VAU_CONSOLIDATION));
  assert.equal(trades.length, 1);
  assert.equal(trades[0].symbol, "ASL");
});

test("identical trades on one day are numbered rather than collapsed", () => {
  const trades = parseDirectsharesAllTradesCsv(report(ASL_BUY, ASL_BUY));
  assert.equal(trades.length, 2);
  assert.notEqual(trades[0].externalId, trades[1].externalId, "a shared id would dedupe a real trade away");
  // Ids must stay stable across re-imports, which is what the dedupe on externalId relies on.
  const again = parseDirectsharesAllTradesCsv(report(ASL_BUY, ASL_BUY));
  assert.deepEqual(again.map((trade) => trade.externalId), trades.map((trade) => trade.externalId));
});

test("a localised date still parses", () => {
  const localised = ASL_BUY.replace("2025-07-14", "14/07/2025");
  assert.equal(parseDirectsharesAllTradesCsv(report(localised))[0].tradeDate, "2025-07-14");
});

test("a file with no trades is rejected rather than imported as nothing", () => {
  assert.throws(() => parseDirectsharesAllTradesCsv(report(VAU_CONSOLIDATION)), /No Directshares trades/);
  assert.throws(() => parseDirectsharesAllTradesCsv("Nothing,useful\n1,2"), /No Directshares All Trades header/);
});
