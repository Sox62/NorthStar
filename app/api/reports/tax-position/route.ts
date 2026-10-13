import { getStorage, type DashboardData, type OwnerType, type Scope, type StoredTransaction } from "@/lib/storage";
import { buildTaxLots } from "@/lib/tax-lots";
import { recordedSectorForInstrument } from "@/southernstar/lib/sector-map";

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
  "acquisition_date",
  "held_days",
  "discount_eligible",
  "taxable_gain_if_sold_aud",
];

function csvCell(value: CsvCell) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: CsvRow[]) {
  // Padded to the header width so a row written before the CGT columns existed still lines up.
  return rows
    .map((row) => [...row, ...Array(Math.max(0, header.length - row.length)).fill("")])
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
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

/**
 * How a parcel's CGT discount reads when its acquisition date is unknown.
 *
 * The thirteen fallback parcels — physical metal, and Directshares holdings whose first buy
 * predates the All Trades Report — have no date to test the twelve-month rule against. Exporting
 * "no" would assert they fail it, which is a claim with tax consequences; blank says nothing at
 * all. "unknown" is the only honest third answer.
 */
function discountEligibility(acquisitionDate: string | null, eligible: boolean) {
  if (!acquisitionDate) return "unknown";
  return eligible ? "yes" : "no";
}

function addTaxRows(rows: CsvRow[], data: DashboardData, transactions: StoredTransaction[]) {
  /*
   * One row per CGT parcel, not per position. A holding built from three buys at three prices is
   * three assets for capital gains purposes, each with its own acquisition date and its own answer
   * to the twelve-month test, and a single averaged row cannot express that.
   */
  const { openLots } = buildTaxLots(data, transactions);
  const holdings = data.holdings.filter((holding) => holding.costAud !== 0 || holding.marketValueAud !== 0);
  const sectorByHoldingId = new Map(holdings.map((holding) => [holding.id, recordedSectorForInstrument(holding)]));

  /*
   * The totals are summed from the parcels rather than from the holdings. They used to come from
   * the holdings, which include cash and closed-out rows that never become CGT parcels, so the
   * summary disagreed with the lines beneath it by the value of whatever it had swept in — while
   * its own note claimed cash was excluded. Summing the parcels makes the section foot by
   * construction, and gains and losses are counted per parcel, which is how the ATO sees them:
   * each parcel is its own asset, so a loss on one does not quietly net off a gain on another
   * inside the same holding.
   */
  const totalCost = openLots.reduce((sum, lot) => sum + lot.costAud, 0);
  const totalMarketValue = openLots.reduce((sum, lot) => sum + lot.marketValueAud, 0);
  const unrealisedGain = unrealisedAud(totalCost, totalMarketValue);
  const grossGains = openLots.reduce((sum, lot) => lot.unrealisedGainAud > 0 ? sum + lot.unrealisedGainAud : sum, 0);
  const grossLosses = openLots.reduce((sum, lot) => lot.unrealisedGainAud < 0 ? sum + Math.abs(lot.unrealisedGainAud) : sum, 0);
  const taxableIfSold = openLots.reduce((sum, lot) => sum + lot.taxableGainIfSoldAud, 0);
  const undatedParcels = openLots.filter((lot) => !lot.acquisitionDate).length;

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
    `Gross gains ${money(grossGains)}; gross losses ${money(grossLosses)}; ${openLots.length} parcels; cash ${money(data.cashValue)} excluded${undatedParcels ? `; ${undatedParcels} parcels have no acquisition date, so their discount eligibility is unknown and the taxable figure assumes none` : ""}`,
    data.lastUpdated,
    "",
    "",
    undatedParcels ? "partly unknown" : "",
    money(taxableIfSold),
  ]);

  for (const lot of openLots) {
    const undated = !lot.acquisitionDate;
    const detail = [
      sectorByHoldingId.get(lot.id.split(":")[0]) ?? "",
      `${lot.quantity.toLocaleString("en-AU", { maximumFractionDigits: 6 })} units`,
      lot.exchange,
      lot.source === "position_fallback" ? "cost-basis fallback parcel" : "FIFO parcel from imported trades",
      undated ? "no acquisition date; taxable figure assumes no discount" : `discount rate ${(lot.discountRate * 100).toFixed(0)}%`,
    ].filter(Boolean).join("; ");

    rows.push([
      "cgt_parcel",
      ownerLabel(data),
      lot.name,
      lot.symbol,
      lot.broker,
      money(lot.costAud),
      money(lot.marketValueAud),
      money(lot.unrealisedGainAud),
      percent(lot.unrealisedGainPercent),
      "",
      "",
      "",
      "",
      "",
      detail,
      lot.asOfDate,
      lot.acquisitionDate ?? "",
      lot.heldDays ?? "",
      discountEligibility(lot.acquisitionDate, lot.discountEligible),
      money(lot.taxableGainIfSoldAud),
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
      ["metadata", filenameScope(selectedScopes), "SouthernStar tax position", "", "", "", "", "", "", "", "", "", "", "", `Generated ${new Date().toISOString()}; unrealised positions and imported dividend income`, reportAnchor.lastUpdated],
    ];
    dashboards.forEach((dashboard, index) => {
      addTaxRows(rows, dashboard, transactionsByScope[index] ?? []);
      addDividendRows(rows, dashboard, transactionsByScope[index] ?? []);
    });

    const body = csv(rows);
    const filename = `southernstar-tax-position-${filenameScope(selectedScopes)}-${reportDate(reportAnchor)}.csv`;
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
