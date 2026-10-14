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

test("a corporate action is carried through as an action, never as a trade", () => {
  // VAU appears as a "Consolidation" of -42,307 units with no price. Treated as a sale it would
  // invent a disposal; dropped, as it used to be, the consolidation goes unrecorded and the parcel
  // keeps a pre-consolidation unit cost — which overstated VAU's gain by $16,948 in silence.
  const rows = parseDirectsharesAllTradesCsv(report(ASL_BUY, VAU_CONSOLIDATION));
  assert.equal(rows.length, 2);
  const action = rows.find((row) => row.symbol === "VAU");
  assert.equal(action?.type, "CORPORATE_ACTION");
  assert.equal(action?.quantity, -42307, "the signed delta is what the ratio is derived from");
  assert.equal(action?.description, "Consolidation");
  assert.equal(action?.price, undefined, "an action has no price");
  assert.equal(rows.find((row) => row.symbol === "ASL")?.type, "BUY");
});

/** PDN's real history: a 1-for-10 consolidation on a holding built from seven purchases. */
const PDN_ROWS = [
  "PDN,ASX,Paladin Energy Ltd,2021-01-19,Buy,3000,0.3,AUD,,19.95,AUD,1,919.95,",
  "PDN,ASX,Paladin Energy Ltd,2021-01-28,Buy,35000,0.285,AUD,,19.95,AUD,1,9994.95,",
  "PDN,ASX,Paladin Energy Ltd,2021-01-28,Buy,30000,0.3,AUD,,19.95,AUD,1,9019.95,",
  "PDN,ASX,Paladin Energy Ltd,2022-05-03,Buy,6750,0.72,AUD,,0,AUD,1,4860,",
  "PDN,ASX,Paladin Energy Ltd,2023-03-14,Buy,16089,0.62,AUD,,22.23,AUD,1,9999.63,",
  "PDN,ASX,Paladin Energy Ltd,2023-05-30,Buy,9000,0.54,AUD,,19.95,AUD,1,4879.95,",
  "PDN,ASX,Paladin Energy Ltd,2023-12-07,Buy,5000,0.94,AUD,,19.95,AUD,1,4719.95,",
  "PDN,ASX,Paladin Energy Ltd,2024-04-19,Consolidation,-94355,,AUD,,,AUD,,,",
];

test("a corporate action states the holding the export itself reported", () => {
  // The delta alone cannot give a ratio, because it describes only the account this export covers.
  // The export's own running balance can: 104,839 units before, 10,484 after — 1 for 10.
  const action = parseDirectsharesAllTradesCsv(report(...PDN_ROWS))
    .find((row) => row.type === "CORPORATE_ACTION");
  assert.equal(action?.raw?.actionQuantityBefore, 104839);
  assert.equal(action?.raw?.actionQuantityAfter, 10484);
});

test("a later action sits on the holding earlier ones left behind", () => {
  // BOE's bonus issue applies to the 3,750 units surviving its 1-for-8 consolidation, not the
  // 30,000 originally bought. A running balance that ignored the consolidation would say +3.4%.
  const rows = parseDirectsharesAllTradesCsv(report(
    "BOE,ASX,Boss Energy Ltd,2021-09-17,Buy,30000,0.32,AUD,,19.95,AUD,1,9619.95,",
    "BOE,ASX,Boss Energy Ltd,2021-12-07,Consolidation,-26250,,AUD,,,AUD,,,",
    "BOE,ASX,Boss Energy Ltd,2024-01-05,Bonus,1013,,AUD,,,AUD,,,",
  ));
  const [consolidation, bonus] = rows.filter((row) => row.type === "CORPORATE_ACTION");
  assert.deepEqual(
    [consolidation.raw?.actionQuantityBefore, consolidation.raw?.actionQuantityAfter],
    [30000, 3750],
  );
  assert.deepEqual([bonus.raw?.actionQuantityBefore, bonus.raw?.actionQuantityAfter], [3750, 4763]);
});

test("an action with no holding behind it states no ratio", () => {
  // GOLD's split sits on a negative running balance, because its purchases predate every export
  // supplied. A ratio invented from that would be worse than none: the engine reports what it
  // cannot apply, and a stated ratio would stop it ever being reported.
  const action = parseDirectsharesAllTradesCsv(report(
    "GOLD,ASX,Global X Physical Gold,2022-06-30,Sell,-250,24.5,AUD,,19.95,AUD,1,-6105.05,",
    "GOLD,ASX,Global X Physical Gold,2022-06-17,Split,450,,AUD,,,AUD,,,",
  )).find((row) => row.type === "CORPORATE_ACTION");
  assert.equal(action?.raw?.actionQuantityBefore, undefined);
  assert.equal(action?.raw?.actionQuantityAfter, undefined);
});

test("the per-market sheets below the combined total are not read twice", () => {
  // The workbook restates every trade in per-market sheets after the combined listing's Total. Read
  // on, each trade doubles and the running balance behind every ratio is nonsense.
  const rows = parseDirectsharesAllTradesCsv([
    report(...PDN_ROWS),
    "Total,,,,,,,,,,,,,",
    "Grouping 1 ASX,,,,,,,,,,,,,",
    HEADER,
    ...PDN_ROWS,
    "Total,,,,,,,,,,,,,",
  ].join("\n"));
  assert.equal(rows.length, PDN_ROWS.length, "the combined listing once, not the groupings as well");
  const action = rows.find((row) => row.type === "CORPORATE_ACTION");
  assert.equal(action?.raw?.actionQuantityBefore, 104839);
});

test("identical trades on one day are numbered rather than collapsed", () => {
  const trades = parseDirectsharesAllTradesCsv(report(ASL_BUY, ASL_BUY));
  assert.equal(trades.length, 2);
  assert.notEqual(trades[0].externalId, trades[1].externalId, "a shared id would dedupe a real trade away");
  // Ids must stay stable across re-imports, which is what the dedupe on externalId relies on.
  const again = parseDirectsharesAllTradesCsv(report(ASL_BUY, ASL_BUY));
  assert.deepEqual(again.map((trade) => trade.externalId), trades.map((trade) => trade.externalId));
});

test("each row records which fill of the order it is", () => {
  // The id embeds the price, so a later export of the same history at finer precision mints a new
  // id for a trade already held: BOE's 12,263-unit sale arrived as both ":3.73" and ":3.7323". The
  // fill number is what tells one trade exported twice from two genuine fills.
  const [first, second] = parseDirectsharesAllTradesCsv(report(ASL_BUY, ASL_BUY));
  assert.equal(first.raw?.fillIndex, 1);
  assert.equal(second.raw?.fillIndex, 2);
  // A rounded price is a different id but still the first fill of that day's trade.
  const rounded = parseDirectsharesAllTradesCsv(report(ASL_BUY.replace("1.45", "1.4500001")))[0];
  assert.notEqual(rounded.externalId, first.externalId, "the id moves with the price");
  assert.equal(rounded.raw?.fillIndex, 1, "the fill number does not");
});

test("a localised date still parses", () => {
  const localised = ASL_BUY.replace("2025-07-14", "14/07/2025");
  assert.equal(parseDirectsharesAllTradesCsv(report(localised))[0].tradeDate, "2025-07-14");
});

test("a file of nothing but corporate actions still imports them", () => {
  // They are not trades, but they are records that change a cost base, so rejecting the file would
  // put the system back to having no idea the action happened.
  const rows = parseDirectsharesAllTradesCsv(report(VAU_CONSOLIDATION));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "CORPORATE_ACTION");
});

test("a file with nothing usable in it is still rejected", () => {
  assert.throws(() => parseDirectsharesAllTradesCsv("Nothing,useful\n1,2"), /No Directshares All Trades header/);
  assert.throws(() => parseDirectsharesAllTradesCsv(report()), /No Directshares trades/);
});
