import { XMLParser } from "fast-xml-parser";
import type { BrokerAdapter, ImportedTransaction } from "./types";

const arr = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const numberOrUndefined = (value: unknown) => value === "" || value == null ? undefined : Number(value);
const isoDate = (value: unknown) => String(value ?? "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");

export function parseIbkrFlexXml(xml: string): ImportedTransaction[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false });
  const root = parser.parse(xml);
  const statements = arr(root?.FlexQueryResponse?.FlexStatements?.FlexStatement);
  const output: ImportedTransaction[] = [];

  for (const statement of statements) {
    const statementAccount = String(statement?.accountId ?? "");
    for (const trade of arr<Record<string, unknown>>(statement?.Trades?.Trade)) {
      const isCash = trade.assetCategory === "CASH";
      const type = isCash ? "FX" : String(trade.buySell).toUpperCase() === "SELL" ? "SELL" : "BUY";
      const conid = String(trade.conid ?? "");
      const isin = String(trade.isin ?? trade.securityID ?? "");
      const symbol = String(trade.symbol ?? "");
      const exchange = String(trade.listingExchange ?? trade.exchange ?? "");

      output.push({
        externalId: String(trade.transactionID ?? trade.tradeID ?? trade.ibExecID),
        externalAccountId: String(trade.accountId ?? statementAccount),
        tradeDate: isoDate(trade.tradeDate),
        settleDate: isoDate(trade.settleDateTarget),
        symbol,
        exchange,
        description: String(trade.description ?? ""),
        instrumentKey: conid || isin || `${symbol}:${exchange}`,
        isin: isin || undefined,
        conid: conid || undefined,
        assetCategory: String(trade.assetCategory ?? ""),
        subCategory: String(trade.subCategory ?? ""),
        type,
        quantity: numberOrUndefined(trade.quantity),
        price: numberOrUndefined(trade.tradePrice),
        closePrice: numberOrUndefined(trade.closePrice),
        cost: numberOrUndefined(trade.cost),
        currency: String(trade.currency ?? "AUD"),
        fees: Math.abs(numberOrUndefined(trade.ibCommission) ?? 0),
        taxes: Math.abs(numberOrUndefined(trade.taxes) ?? 0),
        netCash: numberOrUndefined(trade.netCash),
        fxRateToBase: numberOrUndefined(trade.fxRateToBase),
        realisedPnl: numberOrUndefined(trade.fifoPnlRealized),
        source: "IBKR Flex",
        raw: trade,
      });
    }
  }

  if (!output.length) throw new Error("No IBKR trades were found in this Flex report.");
  return output;
}

export class IbkrFlexAdapter implements BrokerAdapter {
  name = "IBKR Flex";
  async importTransactions(_from: string, _to: string) {
    if (!process.env.IBKR_FLEX_TOKEN || !process.env.IBKR_FLEX_QUERY_ID) return [];
    throw new Error("Live Flex retrieval is not enabled in this build; XML upload parsing is available.");
  }
}
