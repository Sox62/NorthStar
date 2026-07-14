import { XMLParser } from "fast-xml-parser";
import type { BrokerAdapter, IbkrFlexReport, IbkrOpenPosition, ImportedTransaction } from "./types";

const arr = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const numberValue = (value: unknown, fallback = 0) => {
  if (value === "" || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const numberOrUndefined = (value: unknown) => value === "" || value == null ? undefined : Number(value);
const isoDate = (value: unknown) => String(value ?? "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");

function parseTransactions(statement: Record<string, unknown>, statementAccount: string): ImportedTransaction[] {
  const output: ImportedTransaction[] = [];
  const trades = arr<Record<string, unknown>>((statement as { Trades?: { Trade?: Record<string, unknown> | Record<string, unknown>[] } }).Trades?.Trade);

  for (const trade of trades) {
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

  return output;
}

function parseOpenPositions(statement: Record<string, unknown>, statementAccount: string): IbkrOpenPosition[] {
  const output: IbkrOpenPosition[] = [];
  const positions = arr<Record<string, unknown>>((statement as { OpenPositions?: { OpenPosition?: Record<string, unknown> | Record<string, unknown>[] } }).OpenPositions?.OpenPosition);

  for (const position of positions) {
    const quantity = numberValue(position.position);
    if (Math.abs(quantity) < 0.00000001) continue;

    const fxRateToBase = numberValue(position.fxRateToBase, 1) || 1;
    const conid = String(position.conid ?? "");
    const isin = String(position.isin ?? position.securityID ?? "");
    const symbol = String(position.symbol ?? "");
    const exchange = String(position.listingExchange ?? "");
    const costAud = numberValue(position.costBasisMoney) * fxRateToBase;
    const marketValueAud = numberValue(position.positionValue) * fxRateToBase;
    const pnlAud = numberValue(position.fifoPnlUnrealized) * fxRateToBase;

    output.push({
      externalAccountId: String(position.accountId ?? statementAccount),
      instrumentKey: conid || isin || `${symbol}:${exchange}`,
      symbol,
      description: String(position.description ?? symbol),
      exchange,
      currency: String(position.currency ?? "AUD"),
      quantity,
      lastPrice: numberValue(position.markPrice),
      fxRateToBase,
      averageCostAud: numberValue(position.costBasisPrice) * fxRateToBase,
      costAud,
      marketValueAud,
      pnlAud,
      pnlPercent: costAud ? pnlAud / costAud * 100 : 0,
      asOfDate: isoDate(position.reportDate),
      conid: conid || undefined,
      isin: isin || undefined,
      assetCategory: String(position.assetCategory ?? ""),
      subCategory: String(position.subCategory ?? ""),
      raw: position,
    });
  }

  return output;
}

export function parseIbkrFlexXml(xml: string): IbkrFlexReport {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false });
  const root = parser.parse(xml);
  const statements = arr<Record<string, unknown>>(root?.FlexQueryResponse?.FlexStatements?.FlexStatement);
  if (!statements.length) throw new Error("No IBKR Flex statement was found in this XML file.");

  const accountIds = new Set(statements.map(statement => String(statement.accountId ?? "")).filter(Boolean));
  if (accountIds.size > 1) throw new Error("This build supports one IBKR account per uploaded Flex report.");

  const transactions: ImportedTransaction[] = [];
  const openPositions: IbkrOpenPosition[] = [];
  let cash: IbkrFlexReport["cash"] = null;
  let accountId = "IBKR";
  let fromDate = "";
  let toDate = "";
  let whenGenerated: string | undefined;

  for (const statement of statements) {
    const statementAccount = String(statement.accountId ?? accountId);
    accountId = statementAccount || accountId;
    fromDate = fromDate || isoDate(statement.fromDate);
    toDate = toDate || isoDate(statement.toDate);
    whenGenerated = whenGenerated || String(statement.whenGenerated ?? "") || undefined;

    transactions.push(...parseTransactions(statement, statementAccount));
    openPositions.push(...parseOpenPositions(statement, statementAccount));

    const cashRows = arr<Record<string, unknown>>((statement as { CashReport?: { CashReportCurrency?: Record<string, unknown> | Record<string, unknown>[] } }).CashReport?.CashReportCurrency);
    const base = cashRows.find(row => row.levelOfDetail === "BaseCurrency" || row.currency === "BASE_SUMMARY");
    if (base) {
      cash = {
        externalAccountId: String(base.accountId ?? statementAccount),
        currency: "AUD",
        balance: numberValue(base.endingCash),
        balanceAud: numberValue(base.endingCash),
        settledBalance: numberValue(base.endingSettledCash, numberValue(base.endingCash)),
        fxRateToAud: 1,
        asOfDate: isoDate(base.toDate ?? statement.toDate),
        raw: base,
      };
    }
  }

  if (!transactions.length && !openPositions.length && !cash) {
    throw new Error("No IBKR trades, open positions or cash report were found in this Flex report.");
  }

  return { accountId, fromDate, toDate, whenGenerated, transactions, openPositions, cash };
}

type FlexServiceResponse = {
  status: string;
  referenceCode?: string;
  url?: string;
  errorCode?: string;
  errorMessage?: string;
};

function parseFlexServiceResponse(xml: string): FlexServiceResponse {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false });
  const root = parser.parse(xml)?.FlexStatementResponse;
  if (!root) throw new Error("IBKR returned an unexpected Flex Web Service response.");
  return {
    status: String(root.Status ?? ""),
    referenceCode: root.ReferenceCode == null ? undefined : String(root.ReferenceCode),
    url: root.Url == null ? undefined : String(root.Url),
    errorCode: root.ErrorCode == null ? undefined : String(root.ErrorCode),
    errorMessage: root.ErrorMessage == null ? undefined : String(root.ErrorMessage),
  };
}

async function flexFetch(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": `Node.js/${process.versions.node} NorthStar/0.3.4` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`IBKR Flex Web Service returned HTTP ${response.status}.`);
    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("IBKR Flex Web Service did not respond in time.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function fetchIbkrFlexXml(token = process.env.IBKR_FLEX_TOKEN, queryId = process.env.IBKR_FLEX_QUERY_ID): Promise<string> {
  if (!token?.trim() || !queryId?.trim()) throw new Error("IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID are not configured.");

  const sendUrl = new URL("https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest");
  sendUrl.searchParams.set("t", token.trim());
  sendUrl.searchParams.set("q", queryId.trim());
  sendUrl.searchParams.set("v", "3");
  const sendText = await flexFetch(sendUrl);
  const send = parseFlexServiceResponse(sendText);
  if (send.status.toLowerCase() !== "success" || !send.referenceCode) {
    throw new Error(`IBKR Flex request failed${send.errorCode ? ` (${send.errorCode})` : ""}: ${send.errorMessage || "Unknown error"}`);
  }

  const statementBase = send.url || "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt) await sleep(2000);
    const getUrl = new URL(statementBase);
    getUrl.searchParams.set("t", token.trim());
    getUrl.searchParams.set("q", send.referenceCode);
    getUrl.searchParams.set("v", "3");
    const text = await flexFetch(getUrl);
    if (text.includes("<FlexQueryResponse")) return text;

    const response = parseFlexServiceResponse(text);
    const pending = response.errorCode === "1019" || /progress|not ready|generation/i.test(response.errorMessage || "");
    if (pending) continue;
    throw new Error(`IBKR Flex retrieval failed${response.errorCode ? ` (${response.errorCode})` : ""}: ${response.errorMessage || "Unknown error"}`);
  }
  throw new Error("IBKR took too long to generate the Flex report. Try Sync IBKR again shortly.");
}

export async function fetchIbkrFlexReport(): Promise<IbkrFlexReport> {
  return parseIbkrFlexXml(await fetchIbkrFlexXml());
}

export class IbkrFlexAdapter implements BrokerAdapter {
  name = "IBKR Flex";
  async importTransactions(_from: string, _to: string) {
    if (!process.env.IBKR_FLEX_TOKEN || !process.env.IBKR_FLEX_QUERY_ID) return [];
    return (await fetchIbkrFlexReport()).transactions;
  }
}
