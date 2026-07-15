import { getStorage, type DashboardData, type Scope } from "@/lib/storage";

export const runtime = "nodejs";

type CsvCell = string | number | null | undefined;
type CsvRow = CsvCell[];

const scopes: Scope[] = ["overall", "personal", "smsf"];

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

function addDashboardRows(rows: CsvRow[], data: DashboardData) {
  rows.push([
    "account",
    data.scope,
    data.scope === "overall" ? "Consolidated" : data.scope === "smsf" ? "SMSF" : "Personal",
    "",
    money(data.totalValue),
    "",
    `Invested ${money(data.investedValue)}; cash ${money(data.cashValue)}; P/L ${money(data.totalReturn)} (${percent(data.totalReturnPercent)}%)`,
    data.lastUpdated,
  ]);

  for (const item of data.periodReturns) {
    rows.push([
      "period_return",
      data.scope,
      item.label,
      item.key,
      item.valueAud == null ? "" : money(item.valueAud),
      item.valuePercent == null ? "" : percent(item.valuePercent),
      item.note,
      item.endDate,
    ]);
  }

  for (const item of data.allocations) {
    rows.push([
      "allocation",
      data.scope,
      item.name,
      "",
      money(item.amount),
      percent(item.value),
      "Asset allocation by current market value",
      data.lastUpdated,
    ]);
  }

  for (const item of data.currencyExposure) {
    rows.push([
      "currency_exposure",
      data.scope,
      item.currency,
      "",
      money(item.amountAud),
      percent(item.valuePercent),
      `${item.positionCount} instruments; cash ${money(item.cashValueAud)}`,
      data.lastUpdated,
    ]);
  }

  for (const holding of data.holdings) {
    rows.push([
      "holding",
      data.scope,
      holding.name,
      holding.symbol,
      money(holding.marketValueAud),
      percent(holding.weight),
      `${holding.assetClass}; ${holding.broker}; P/L ${money(holding.pnlAud)} (${percent(holding.pnlPercent)}%); ${holding.valuationBasis}`,
      holding.asOfDate,
    ]);
  }
}

export async function GET() {
  try {
    const storage = getStorage();
    const dashboards = await Promise.all(scopes.map((scope) => storage.dashboard(scope)));
    const [overall] = dashboards;
    const rows: CsvRow[] = [
      ["section", "scope", "name", "symbol", "value_aud", "percent", "detail", "as_of"],
      ["metadata", "overall", "NorthStar wealth statement", "", "", "", `Generated ${new Date().toISOString()}`, overall.lastUpdated],
    ];
    for (const dashboard of dashboards) addDashboardRows(rows, dashboard);

    const body = csv(rows);
    const filename = `northstar-wealth-statement-${reportDate(overall)}.csv`;
    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to generate wealth statement" }, { status: 500 });
  }
}
