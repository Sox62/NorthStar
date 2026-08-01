import assert from "node:assert/strict";
import test from "node:test";
import { parseIbkrFlexXml } from "./ibkr";
import { tradingViewSymbolForInstrument } from "@/northstar/lib/tradingview";

const flexXml = `<FlexQueryResponse queryName="NorthStar" type="AF">
  <FlexStatements count="1">
    <FlexStatement accountId="U4317403" fromDate="20260701" toDate="20260731" whenGenerated="20260801;100000">
      <OpenPositions>
        <OpenPosition accountId="U4317403" conid="89258383" symbol="XRH0l" listingExchange="LSE"
          description="X PH RHODIUM ETC" currency="USD" position="20" markPrice="825"
          positionValue="16500" costBasisMoney="10924.61" costBasisPrice="546.23"
          fifoPnlUnrealized="622.19" fxRateToBase="1.4281" reportDate="20260731" assetCategory="STK" />
        <OpenPosition accountId="U4317403" conid="198430807" symbol="GDX" listingExchange="ASX"
          description="VANECK GOLD MINERS ETF" currency="AUD" position="200" markPrice="93.4"
          positionValue="18680" costBasisMoney="18414.72" costBasisPrice="92.0736"
          fifoPnlUnrealized="265.28" fxRateToBase="1" reportDate="20260731" assetCategory="STK" />
      </OpenPositions>
      <Trades>
        <Trade accountId="U4317403" conid="89258383" symbol="XRH0l" listingExchange="LSE"
          description="X PH RHODIUM ETC" tradeDate="20260715" buySell="BUY" quantity="20"
          tradePrice="546.23" currency="USD" fxRateToBase="1.4281" transactionID="9001" />
      </Trades>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>`;

test("parseIbkrFlexXml strips the IBKR trailing venue letter from LSE symbols", () => {
  const report = parseIbkrFlexXml(flexXml);
  const rhodium = report.openPositions.find((position) => position.conid === "89258383");

  assert.ok(rhodium, "the LSE position should be parsed");
  assert.equal(rhodium.symbol, "XRH0", "XRH0l must normalise to the bare ticker");
  assert.equal(rhodium.exchange, "LSE");
  assert.equal(rhodium.currency, "USD");
  assert.equal(rhodium.description, "X PH RHODIUM ETC", "IBKR's description is left verbatim");
  assert.equal(rhodium.instrumentKey, "89258383", "identity stays keyed on conid");
  assert.equal(rhodium.quantity, 20);

  const trade = report.transactions.find((transaction) => transaction.conid === "89258383");
  assert.ok(trade, "the LSE trade should be parsed");
  assert.equal(trade.symbol, "XRH0", "trades must normalise the same way as positions");
});

test("parseIbkrFlexXml leaves symbols on other exchanges untouched", () => {
  const report = parseIbkrFlexXml(flexXml);
  const gdx = report.openPositions.find((position) => position.conid === "198430807");

  assert.ok(gdx);
  assert.equal(gdx.symbol, "GDX");
  assert.equal(gdx.exchange, "ASX");
});

test("the normalised LSE symbol resolves to a usable TradingView symbol", () => {
  const report = parseIbkrFlexXml(flexXml);
  const rhodium = report.openPositions.find((position) => position.conid === "89258383");

  assert.ok(rhodium);
  assert.equal(tradingViewSymbolForInstrument({ symbol: rhodium.symbol, exchange: rhodium.exchange }), "LSE:XRH0");
});
