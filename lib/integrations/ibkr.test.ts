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

test("parseIbkrFlexXml keeps BMN from ASX open positions", () => {
  const report = parseIbkrFlexXml(`<FlexQueryResponse queryName="NorthStar" type="AF">
    <FlexStatements count="1">
      <FlexStatement accountId="U24473088" fromDate="20260807" toDate="20260807" whenGenerated="20260809;084551">
        <OpenPositions>
          <OpenPosition accountId="U24473088" currency="AUD" fxRateToBase="1" assetCategory="STK"
            subCategory="COMMON" symbol="BMN" description="BANNERMAN ENERGY LTD" conid="44188438"
            securityID="AU000000BMN9" isin="AU000000BMN9" listingExchange="ASX" reportDate="20260807"
            position="6000" markPrice="3.39" positionValue="20340" costBasisPrice="3.4230096"
            costBasisMoney="20538.0576" fifoPnlUnrealized="-198.0576" />
        </OpenPositions>
      </FlexStatement>
    </FlexStatements>
  </FlexQueryResponse>`);
  const bmn = report.openPositions.find((position) => position.symbol === "BMN");

  assert.ok(bmn);
  assert.equal(bmn.externalAccountId, "U24473088");
  assert.equal(bmn.instrumentKey, "44188438");
  assert.equal(bmn.description, "BANNERMAN ENERGY LTD");
  assert.equal(bmn.exchange, "ASX");
  assert.equal(bmn.currency, "AUD");
  assert.equal(bmn.quantity, 6000);
  assert.equal(bmn.marketValueAud, 20340);
});

test("parseIbkrFlexXml reads the base-currency Cash Report row", () => {
  const report = parseIbkrFlexXml(`<FlexQueryResponse queryName="NorthStar" type="AF">
    <FlexStatements count="1">
      <FlexStatement accountId="U111" fromDate="20260807" toDate="20260807">
        <CashReport>
          <CashReportCurrency accountId="U111" currency="BASE_SUMMARY" levelOfDetail="BaseCurrency" toDate="20260807" endingCash="120942.64" endingSettledCash="141464.28" />
          <CashReportCurrency accountId="U111" currency="AUD" levelOfDetail="Currency" toDate="20260807" endingCash="120933.63" endingSettledCash="141455.27" />
        </CashReport>
      </FlexStatement>
    </FlexStatements>
  </FlexQueryResponse>`);

  assert.equal(report.cash?.externalAccountId, "U111");
  assert.equal(report.cash?.balanceAud, 120942.64);
  assert.equal(report.cash?.settledBalanceAud, 141464.28);
  assert.equal(report.cashBalances.length, 1);
  assert.equal(report.cashBalances[0]?.currency, "AUD");
  assert.equal(report.cashBalances[0]?.balance, 120933.63);
});

test("parseIbkrFlexXml derives AUD cash from currency rows when the base row is absent", () => {
  const report = parseIbkrFlexXml(`<FlexQueryResponse queryName="NorthStar" type="AF">
    <FlexStatements count="1">
      <FlexStatement accountId="U222" fromDate="20260807" toDate="20260807">
        <CashReport>
          <CashReportCurrency accountId="U222" currency="AUD" levelOfDetail="Currency" toDate="20260807" endingCash="1000" endingSettledCash="900" />
          <CashReportCurrency accountId="U222" currency="USD" levelOfDetail="Currency" toDate="20260807" endingCash="10" endingSettledCash="8" fxRateToBase="1.5" />
        </CashReport>
      </FlexStatement>
    </FlexStatements>
  </FlexQueryResponse>`);

  assert.equal(report.cash?.externalAccountId, "U222");
  assert.equal(report.cash?.balanceAud, 1015);
  assert.equal(report.cash?.settledBalanceAud, 912);
  assert.deepEqual(report.cashBalances.map((cash) => [cash.currency, cash.balance, cash.balanceAud]), [["AUD", 1000, 1000], ["USD", 10, 15]]);
});

test("parseIbkrFlexXml derives a missing USD FX rate from the base cash residual", () => {
  const report = parseIbkrFlexXml(`<FlexQueryResponse queryName="NorthStar" type="AF">
    <FlexStatements count="1">
      <FlexStatement accountId="U333" fromDate="20260807" toDate="20260807">
        <CashReport>
          <CashReportCurrency accountId="U333" currency="BASE_SUMMARY" levelOfDetail="BaseCurrency" toDate="20260807" endingCash="1075" endingSettledCash="1030" />
          <CashReportCurrency accountId="U333" currency="AUD" levelOfDetail="Currency" toDate="20260807" endingCash="1000" endingSettledCash="1000" />
          <CashReportCurrency accountId="U333" currency="USD" levelOfDetail="Currency" toDate="20260807" endingCash="50" endingSettledCash="20" />
        </CashReport>
      </FlexStatement>
    </FlexStatements>
  </FlexQueryResponse>`);

  assert.equal(report.cash?.balanceAud, 1075);
  assert.deepEqual(report.cashBalances.map((cash) => [cash.currency, cash.balance, cash.balanceAud]), [["AUD", 1000, 1000], ["USD", 50, 75]]);
  assert.equal(report.cashBalances.find((cash) => cash.currency === "USD")?.fxRateToAud, 1.5);
});

test("parseIbkrFlexXml rejects non-AUD base statements before importing wrong values", () => {
  assert.throws(() => parseIbkrFlexXml(`<FlexQueryResponse queryName="NorthStar" type="AF">
    <FlexStatements count="1">
      <FlexStatement accountId="U555" fromDate="20260807" toDate="20260807">
        <CashReport>
          <CashReportCurrency accountId="U555" currency="BASE_SUMMARY" levelOfDetail="BaseCurrency" toDate="20260807" endingCash="188862.97" />
          <CashReportCurrency accountId="U555" currency="AUD" levelOfDetail="Currency" toDate="20260807" endingCash="142360.91" />
          <CashReportCurrency accountId="U555" currency="USD" levelOfDetail="Currency" toDate="20260807" endingCash="88247.98" />
        </CashReport>
        <OpenPositions>
          <OpenPosition accountId="U555" currency="USD" fxRateToBase="1" assetCategory="STK"
            symbol="EU" description="ENCORE ENERGY CORP" conid="585033148" listingExchange="NASDAQ"
            reportDate="20260807" position="10000" markPrice="1.25" positionValue="12500"
            costBasisPrice="1.175003" costBasisMoney="11750.03" fifoPnlUnrealized="749.97" />
        </OpenPositions>
      </FlexStatement>
    </FlexStatements>
  </FlexQueryResponse>`), /reporting in USD base currency/);
});

test("parseIbkrFlexXml uses IBKR Conversion Rates for USD-base AUD valuation", () => {
  const report = parseIbkrFlexXml(`<FlexQueryResponse queryName="NorthStar" type="AF">
    <FlexStatements count="1">
      <FlexStatement accountId="U556" fromDate="20260807" toDate="20260807">
        <CashReport>
          <CashReportCurrency accountId="U556" currency="BASE_SUMMARY" levelOfDetail="BaseCurrency" toDate="20260807" endingCash="188862.977418729" endingSettledCash="188247.978287529" />
          <CashReportCurrency accountId="U556" currency="AUD" levelOfDetail="Currency" toDate="20260807" endingCash="142360.91" endingSettledCash="0" />
          <CashReportCurrency accountId="U556" currency="USD" levelOfDetail="Currency" toDate="20260807" endingCash="88247.980667129" endingSettledCash="188247.978287529" />
        </CashReport>
        <OpenPositions>
          <OpenPosition accountId="U556" currency="USD" fxRateToBase="1" assetCategory="STK"
            symbol="EU" description="ENCORE ENERGY CORP" conid="585033148" listingExchange="NASDAQ"
            reportDate="20260807" position="10000" markPrice="1.25" positionValue="12500"
            costBasisPrice="1.175003" costBasisMoney="11750.03" fifoPnlUnrealized="749.97" />
        </OpenPositions>
        <ConversionRates>
          <ConversionRate reportDate="20260807" fromCurrency="AUD" toCurrency="USD" rate="0.70676" />
        </ConversionRates>
      </FlexStatement>
    </FlexStatements>
  </FlexQueryResponse>`);

  assert.equal(Math.round(report.cash?.balanceAud ?? 0), 267224);
  assert.equal(Math.round(report.cashBalances.find((cash) => cash.currency === "USD")?.balanceAud ?? 0), 124863);
  assert.equal(Math.round(report.openPositions.find((position) => position.symbol === "EU")?.marketValueAud ?? 0), 17686);
});

test("parseIbkrFlexXml reads Forex Balances when Cash Report is absent", () => {
  const report = parseIbkrFlexXml(`<FlexQueryResponse queryName="NorthStar" type="AF">
    <FlexStatements count="1">
      <FlexStatement accountId="U444" fromDate="20260807" toDate="20260807">
        <ForexBalances>
          <ForexBalance accountId="U444" assetClass="CASH" reportDate="20260807" functionalCurrency="AUD"
            fxCurrency="AUD" quantity="1000" value="1000" levelOfDetail="Summary" />
          <ForexBalance accountId="U444" assetClass="CASH" reportDate="20260807" functionalCurrency="AUD"
            fxCurrency="USD" quantity="50" value="75" levelOfDetail="Summary" />
        </ForexBalances>
      </FlexStatement>
    </FlexStatements>
  </FlexQueryResponse>`);

  assert.equal(report.cash?.externalAccountId, "U444");
  assert.equal(report.cash?.balanceAud, 1075);
  assert.deepEqual(report.cashBalances.map((cash) => [cash.currency, cash.balance, cash.balanceAud]), [["AUD", 1000, 1000], ["USD", 50, 75]]);
  assert.equal(report.cashBalances.find((cash) => cash.currency === "USD")?.fxRateToAud, 1.5);
});

test("the normalised LSE symbol resolves to a usable TradingView symbol", () => {
  const report = parseIbkrFlexXml(flexXml);
  const rhodium = report.openPositions.find((position) => position.conid === "89258383");

  assert.ok(rhodium);
  assert.equal(tradingViewSymbolForInstrument({ symbol: rhodium.symbol, exchange: rhodium.exchange }), "LSE:XRH0");
});

test("TradingView maps URA on ARCA to the US ETF symbol", () => {
  assert.equal(tradingViewSymbolForInstrument({ symbol: "URA", exchange: "ARCA" }), "AMEX:URA");
  assert.equal(tradingViewSymbolForInstrument({ symbol: "URA", exchange: "NYSEARCA" }), "AMEX:URA");
  assert.equal(tradingViewSymbolForInstrument({ symbol: "URA", exchange: "US" }), "AMEX:URA");
});
