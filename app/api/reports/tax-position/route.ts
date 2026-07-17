import { getStorage, type DashboardData, type OwnerType, type Scope, type StoredTransaction } from "@/lib/storage";
import { sectorForInstrument } from "@/northstar/lib/sector-map";

export const runtime = "nodejs";

type CsvCell = string | number | null | undefined;
type CsvRow = CsvCell[];

const scopes: Scope[] = ["personal", "smsf"];
const header = [
  "section",
  "owner",
  "name",
  "symbol",
  "broker",
  "cost_aud",
  "market_value_aud",
  "unrealised_gain_aud",
  "unrealised_gain_percent",
  "income_aud",
  "tax_withheld_aud",
  "fees_aud",
  "currency",
  "payment_date",
  "detail",
  "as_of",
];

function csvCell(value: CsvCell) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: CsvRow[]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function money(value: number) {
  return value.toFixed(2);
}

function percent(value: number) {
  return value.toFixed(2);
}

function reportDate(data: DashboardData) {
  return (data.lastUpdated ?? new Date().toISOString()).slice(0, 10);
}

function ownerLabel(data: DashboardData) {
  return data.scope === "smsf" ? "SMSF" : "Personal";
}

function ownerTypeForScope(scope: Scope): OwnerType {
  return scope === "smsf" ? "SMSF" : "PERSONAL";
}

function reportScopes(requested: string | null): Scope[] {
  if (requested === "personal" || requested === "smsf") return [requested];
  return scopes;
}

function filenameScope(selectedScopes: Scope[]) {
  if (selectedScopes.length === 1) return selectedScopes[0];
  return "overall";
}

function unrealisedAud(costAud: number, marketValueAud: number) {
  return marketValueAud - costAud;
}

function unrealisedPercent(costAud: number, marketValueAud: number) {
  return costAud ? unrealisedAud(costAud, marketValueAud) / costAud * 100 : 0;
}

function addTaxRows(rows: CsvRow[], data: DashboardData) {
  const holdings = data.holdings.filter((holding) => holding.costAud !== 0 || holding.marketValueAud !== 0);
  const totalCost = holdings.reduce((sum, holding) => sum + holding.costAud, 0);
  const totalMarketValue = holdings.reduce((sum, holding) => sum + holding.marketValueAud, 0);
  const unrealisedGain = unrealisedAud(totalCost, totalMarketValue);
  const grossGains = holdings.reduce((sum, holding) => {
    const gain = unrealisedAud(holding.costAud, holding.marketValueAud);
    return gain > 0 ? sum + gain : sum;
  }, 0);
  const grossLosses = holdings.reduce((sum, holding) => {
    const gain = unrealisedAud(holding.costAud, holding.marketValueAud);
    return gain < 0 ? sum + Math.abs(gain) : sum;
  }, 0);

  rows.push([
    "tax_summary",
    ownerLabel(data),
    "Unrealised position",
    "",
    "",
    money(totalCost),
    money(totalMarketValue),
    money(unrealisedGain),
    totalCost ? percent(unrealisedGain / totalCost * 100) : "",
    "",
    "",
    "",
    "",
    "",
    `Gross gains ${money(grossGains)}; gross losses ${money(grossLosses)}; cash ${money(data.cashValue)} excluded from CGT lots`,
    data.lastUpdated,
  ]);

  for (const holding of holdings) {
    const gain = unrealisedAud(holding.costAud, holding.marketValueAud);
    rows.push([
      "tax_lot",
      ownerLabel(data),
      holding.name,
      holding.symbol,
      holding.broker,
      money(holding.costAud),
      money(holding.marketValueAud),
      money(gain),
      percent(unrealisedPercent(holding.costAud, holding.marketValueAud)),
      "",
      "",
      "",
      holding.currency,
      "",
      `${sectorForInstrument(holding)}; ${holding.quantity.toLocaleString("en-AU", { maximumFractionDigits: 6 })} units; ${holding.currency}; ${holding.valuationBasis}; ${holding.source}`,
      holding.asOfDate,
    ]);
  }
}

function addDividendRows(rows: CsvRow[], data: DashboardData, transactions: StoredTransaction[]) {
  const dividends = transactions.filter((transaction) => transaction.type === "DIVIDEND");
  const totalNetCash = dividends.reduce((sum, transaction) => sum + (transaction.netCash ?? 0), 0);
  const totalTaxWithheld = dividends.reduce((sum, transaction) => sum + (transaction.taxes ?? 0), 0);

  if (!dividends.length) return;

  rows.push([
    "dividend_summary",
    ownerLabel(data),
    "Dividend income",
    "",
    "",
    "",
    "",
    "",
    "",
    money(totalNetCash),
    money(totalTaxWithheld),
    "",
    "AUD",
    "",
    `Payments ${dividends.length}`,
    data.lastUpdated,
  ]);

  for (const dividend of dividends) {
    rows.push([
      "dividend_income",
      ownerLabel(data),
      dividend.description || `${dividend.symbol} dividend`,
      dividend.symbol,
      dividend.broker,
      "",
      "",
      "",
      "",
      money(dividend.netCash ?? 0),
      money(dividend.taxes ?? 0),
      money(dividend.fees ?? 0),
      dividend.currency,
      dividend.tradeDate,
      `Currency ${dividend.currency}; tax withheld ${money(dividend.taxes ?? 0)}; fees ${money(dividend.fees ?? 0)}; source ${dividend.source}`,
      dividend.tradeDate,
    ]);
  }
}

export async function GET(request: Request) {
  try {
    const requestedScope = new URL(request.url).searchParams.get("scope");
    const selectedScopes = reportScopes(requestedScope);
    const storage = getStorage();
    const dashboards = await Promise.all(selectedScopes.map((scope) => storage.dashboard(scope)));
    const transactionsByScope = await Promise.all(selectedScopes.map((scope) => storage.listTransactions(ownerTypeForScope(scope))));
    const reportAnchor = dashboards[0];
    const rows: CsvRow[] = [
      header,
      ["metadata", filenameScope(selectedScopes), "NorthStar tax position", "", "", "", "", "", "", "", "", "", "", "", `Generated ${new Date().toISOString()}; unrealised positions and imported dividend income`, reportAnchor.lastUpdated],
    ];
    dashboards.forEach((dashboard, index) => {
      addTaxRows(rows, dashboard);
      addDividendRows(rows, dashboard, transactionsByScope[index] ?? []);
    });

    const body = csv(rows);
    const filename = `northstar-tax-position-${filenameScope(selectedScopes)}-${reportDate(reportAnchor)}.csv`;
    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to generate tax position" }, { status: 500 });
  }
}
