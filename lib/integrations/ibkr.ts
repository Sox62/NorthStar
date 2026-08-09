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

function cashSnapshotFromRow(
  row: Record<string, unknown>,
  statementAccount: string,
  statementToDate: unknown,
  inferredFxRateToAud?: number,
): IbkrFlexReport["cash"] {
  const currency = String(row.currency ?? "AUD").toUpperCase();
  const isBase = row.levelOfDetail === "BaseCurrency" || currency === "BASE_SUMMARY";
  const cashCurrency = isBase ? "AUD" : currency;
  const fxRateToAud = isBase || cashCurrency === "AUD" ? 1 : numberValue(row.fxRateToBase, inferredFxRateToAud ?? 0);
  if (!fxRateToAud) return null;
  const balance = numberValue(row.endingCash);
  const settledBalance = numberValue(row.endingSettledCash, balance);
  return {
    externalAccountId: String(row.accountId ?? statementAccount),
    currency: cashCurrency,
    balance,
    balanceAud: balance * fxRateToAud,
    settledBalance,
    settledBalanceAud: settledBalance * fxRateToAud,
    fxRateToAud,
    asOfDate: isoDate(row.toDate ?? statementToDate),
    raw: row,
  };
}

function inferredFxRatesFromBase(base: Record<string, unknown> | undefined, currencyRows: Record<string, unknown>[]) {
  const rates = new Map<string, number>();
  if (!base) return rates;

  const knownRows = currencyRows
    .map(row => cashSnapshotFromRow(row, String(row.accountId ?? ""), row.toDate))
    .filter((row): row is NonNullable<IbkrFlexReport["cash"]> => Boolean(row));
  const unknownRows = currencyRows.filter((row) => {
    const currency = String(row.currency ?? "").toUpperCase();
    return currency !== "AUD" && !numberValue(row.fxRateToBase, 0) && Math.abs(numberValue(row.endingCash)) > 0.00000001;
  });

  if (unknownRows.length !== 1) return rates;
  const unknown = unknownRows[0]!;
  const baseCashAud = numberValue(base.endingCash);
  const knownAud = knownRows.reduce((sum, row) => row.currency === String(unknown.currency).toUpperCase() ? sum : sum + row.balanceAud, 0);
  const residualAud = baseCashAud - knownAud;
  const localBalance = numberValue(unknown.endingCash);
  if (localBalance) rates.set(String(unknown.currency).toUpperCase(), residualAud / localBalance);

  const baseSettledAud = numberValue(base.endingSettledCash, baseCashAud);
  const knownSettledAud = knownRows.reduce((sum, row) => row.currency === String(unknown.currency).toUpperCase() ? sum : sum + row.settledBalanceAud, 0);
  const settledResidualAud = baseSettledAud - knownSettledAud;
  const localSettled = numberValue(unknown.endingSettledCash, localBalance);
  if (localSettled && !rates.has(String(unknown.currency).toUpperCase())) rates.set(String(unknown.currency).toUpperCase(), settledResidualAud / localSettled);
  return rates;
}

function parseCashSnapshots(
  rows: Record<string, unknown>[],
  statementAccount: string,
  statementToDate: unknown,
): { aggregate: IbkrFlexReport["cash"]; balances: NonNullable<IbkrFlexReport["cash"]>[] } {
  const base = rows.find(row => row.levelOfDetail === "BaseCurrency" || row.currency === "BASE_SUMMARY");
  const currencyRows = rows.filter(row => row.levelOfDetail === "Currency" && row.currency !== "BASE_SUMMARY");
  const inferredFxRates = inferredFxRatesFromBase(base, currencyRows);
  const aggregate = base ? cashSnapshotFromRow(base, statementAccount, statementToDate) : null;
  const balances = currencyRows
    .map(row => cashSnapshotFromRow(row, statementAccount, statementToDate, inferredFxRates.get(String(row.currency ?? "").toUpperCase())))
    .filter((row): row is NonNullable<IbkrFlexReport["cash"]> => Boolean(row))
    .filter(row => Math.abs(row.balance) > 0.00000001 || Math.abs(row.settledBalance) > 0.00000001);

  if (aggregate) return { aggregate, balances: balances.length ? balances : [aggregate] };
  if (!balances.length) return { aggregate: null, balances: [] };

  const aggregateFromBalances = balances.reduce<NonNullable<IbkrFlexReport["cash"]>>((sum, row) => ({
    externalAccountId: row.externalAccountId,
    currency: "AUD",
    balance: sum.balance + row.balanceAud,
    balanceAud: sum.balanceAud + row.balanceAud,
    settledBalance: sum.settledBalance + row.settledBalanceAud,
    settledBalanceAud: sum.settledBalanceAud + row.settledBalanceAud,
    fxRateToAud: 1,
    asOfDate: row.asOfDate,
    raw: { derivedFrom: "CashReportCurrency" },
  }), {
    externalAccountId: balances[0]?.externalAccountId ?? statementAccount,
    currency: "AUD",
    balance: 0,
    balanceAud: 0,
    settledBalance: 0,
    settledBalanceAud: 0,
    fxRateToAud: 1,
    asOfDate: balances[0]?.asOfDate ?? isoDate(statementToDate),
  });
  return { aggregate: aggregateFromBalances, balances };
}

// Flex reports the local exchange symbol, and IBKR's LSE listings carry a trailing lowercase
// venue letter ("XRH0l"). Every other source — the trading API, Directshares, TradingView and
// our own sector map — uses the bare ticker, so normalise at the edge rather than teaching each
// consumer about the suffix. Position identity is keyed on conid, so this does not re-key anything.
function flexSymbol(symbol: string, exchange: string) {
  if (exchange.toUpperCase() !== "LSE") return symbol;
  return /^[A-Z0-9]{2,}[a-z]$/.test(symbol) ? symbol.slice(0, -1) : symbol;
}

function parseTransactions(statement: Record<string, unknown>, statementAccount: string): ImportedTransaction[] {
  const output: ImportedTransaction[] = [];
  const trades = arr<Record<string, unknown>>((statement as { Trades?: { Trade?: Record<string, unknown> | Record<string, unknown>[] } }).Trades?.Trade);

  for (const trade of trades) {
    const isCash = trade.assetCategory === "CASH";
    const type = isCash ? "FX" : String(trade.buySell).toUpperCase() === "SELL" ? "SELL" : "BUY";
    const conid = String(trade.conid ?? "");
    const isin = String(trade.isin ?? trade.securityID ?? "");
    const exchange = String(trade.listingExchange ?? trade.exchange ?? "");
    const symbol = flexSymbol(String(trade.symbol ?? ""), exchange);

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
    const exchange = String(position.listingExchange ?? "");
    const symbol = flexSymbol(String(position.symbol ?? ""), exchange);
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
  const cashBalances: NonNullable<IbkrFlexReport["cash"]>[] = [];
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
    const parsedCash = parseCashSnapshots(cashRows, statementAccount, statement.toDate);
    cash = parsedCash.aggregate ?? cash;
    cashBalances.push(...parsedCash.balances);
  }

  if (!transactions.length && !openPositions.length && !cash) {
    throw new Error("No IBKR trades, open positions or cash report were found in this Flex report.");
  }

  return { accountId, fromDate, toDate, whenGenerated, transactions, openPositions, cash, cashBalances };
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
      headers: { "user-agent": `Node.js/${process.versions.node} NorthStar/0.3.7` },
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

export async function fetchIbkrFlexReport(token?: string, queryId?: string): Promise<IbkrFlexReport> {
  return parseIbkrFlexXml(await fetchIbkrFlexXml(token, queryId));
}

export class IbkrFlexAdapter implements BrokerAdapter {
  name = "IBKR Flex";
  async importTransactions(_from: string, _to: string) {
    if (!process.env.IBKR_FLEX_TOKEN || !process.env.IBKR_FLEX_QUERY_ID) return [];
    return (await fetchIbkrFlexReport()).transactions;
  }
}
