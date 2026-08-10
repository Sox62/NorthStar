import { getStorage, type DashboardData } from "@/lib/storage";
import { sectorForInstrument } from "@/northstar/lib/sector-map";

export const runtime = "nodejs";

type CsvCell = string | number | null | undefined;
type CsvRow = CsvCell[];

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
  return data.scope === "smsf" ? "SMSF" : data.scope === "personal" ? "Personal" : "Consolidated";
}

function addOwnerRows(rows: CsvRow[], data: DashboardData, overallValue: number) {
  rows.push([
    "ownership_summary",
    ownerLabel(data),
    "Net asset value",
    "",
    money(data.totalValue),
    overallValue ? percent(data.totalValue / overallValue * 100) : "",
    `Invested ${money(data.investedValue)}; cash ${money(data.cashValue)}; P/L ${money(data.totalReturn)} (${percent(data.totalReturnPercent)}%)`,
    data.lastUpdated,
  ]);

  for (const account of data.accounts) {
    rows.push([
      "account_reference",
      ownerLabel(data),
      account.name,
      "",
      "",
      "",
      `${account.detail}; ${account.status}`,
      data.lastUpdated,
    ]);
  }

  for (const holding of data.holdings) {
    rows.push([
      "estate_asset",
      ownerLabel(data),
      holding.name,
      holding.symbol,
      money(holding.marketValueAud),
      percent(holding.weight),
      `${sectorForInstrument(holding)}; ${holding.broker}; ${holding.valuationBasis}; P/L ${money(holding.pnlAud)} (${percent(holding.pnlPercent)}%)`,
      holding.asOfDate,
    ]);
  }

  if (data.cashValue > 0) {
    rows.push([
      "estate_asset",
      ownerLabel(data),
      "Cash",
      "CASH",
      money(data.cashValue),
      percent(data.totalValue ? data.cashValue / data.totalValue * 100 : 0),
      "External and broker cash included in NAV",
      data.lastUpdated,
    ]);
  }
}

export async function GET() {
  try {
    const storage = getStorage();
    const [overall, personal, smsf] = await Promise.all([
      storage.dashboard("overall"),
      storage.dashboard("personal"),
      storage.dashboard("smsf"),
    ]);
    const rows: CsvRow[] = [
      ["section", "owner", "name", "symbol", "value_aud", "percent", "detail", "as_of"],
      ["metadata", "Consolidated", "NorthStar estate summary", "", money(overall.totalValue), "100.00", `Generated ${new Date().toISOString()}`, overall.lastUpdated],
    ];
    addOwnerRows(rows, personal, overall.totalValue);
    addOwnerRows(rows, smsf, overall.totalValue);

    const body = csv(rows);
    const filename = `northstar-estate-summary-${reportDate(overall)}.csv`;
    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to generate estate summary" }, { status: 500 });
  }
}
