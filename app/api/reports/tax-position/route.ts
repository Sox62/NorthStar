import { parcelSelectionLabels, type ParcelSelection } from "@/lib/parcel-selection";
import { dateInRange } from "@/lib/reports/eofy/utils";
import { reportPeriod, type ReportPeriod } from "@/lib/reports/report-period";
import { getStorage, type DashboardData, type OwnerType, type Scope, type StoredTransaction } from "@/lib/storage";
import { buildTaxLots, type TaxTreatment } from "@/lib/tax-lots";
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
  // Appended for the realised section. A disposal's proceeds are not a market value and its gain
  // is not contingent on selling, so overloading the unrealised columns would mislabel both.
  "disposal_date",
  "proceeds_aud",
  "realised_gain_aud",
  "taxable_gain_aud",
  // Which rule chose the parcel. A disposal has to be explainable years later, and the choice of
  // parcel changes the gain without changing the position, so it belongs in the export itself.
  "selection_method",
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
function discountEligibility(acquisitionDate: string | null, eligible: boolean, treatment: TaxTreatment) {
  // In pension phase the discount is not merely unavailable, it is irrelevant: the gain is exempt,
  // so "no" would read as "taxed in full", the opposite of the truth.
  if (treatment.pensionPhase) return "exempt";
  if (!acquisitionDate) return "unknown";
  return eligible ? "yes" : "no";
}

function addTaxRows(rows: CsvRow[], data: DashboardData, transactions: StoredTransaction[], treatment: TaxTreatment, period: ReportPeriod, selection?: ParcelSelection) {
  /*
   * One row per CGT parcel, not per position. A holding built from three buys at three prices is
   * three assets for capital gains purposes, each with its own acquisition date and its own answer
   * to the twelve-month test, and a single averaged row cannot express that.
   */
  const { openLots, realisedLots, missingFx } = buildTaxLots(data, transactions, new Date(), treatment, selection);
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
    `Gross gains ${money(grossGains)}; gross losses ${money(grossLosses)}; ${openLots.length} parcels; cash ${money(data.cashValue)} excluded`
      + (treatment.pensionPhase ? "; pension phase, so capital gains are exempt current pension income and nothing here is taxable" : "")
      + (!treatment.pensionPhase && undatedParcels ? `; ${undatedParcels} parcels have no acquisition date, so their discount eligibility is unknown and the taxable figure assumes none` : "")
      /*
       * An open position cannot be rewound. The parcels come from today's holdings at today's
       * prices, so a requested period scopes the realised and income sections beneath and leaves
       * this one alone. Saying so here is the difference between a caveat and a wrong number.
       */
      + (period.scoped ? `; unrealised figures are as at ${reportDate(data)} regardless of the requested period, which no stored history can rewind` : ""),
    data.lastUpdated,
    "",
    "",
    treatment.pensionPhase ? "exempt" : undatedParcels ? "partly unknown" : "",
    money(taxableIfSold),
  ]);

  for (const lot of openLots) {
    const undated = !lot.acquisitionDate;
    const detail = [
      sectorByHoldingId.get(lot.id.split(":")[0]) ?? "",
      `${lot.quantity.toLocaleString("en-AU", { maximumFractionDigits: 6 })} units`,
      lot.exchange,
      // Not labelled with a selection method: an open parcel is what no disposal has consumed, so
      // no method chose it. The method appears on the disposals, where it did the choosing.
      lot.source === "position_fallback" ? "cost-basis fallback parcel" : "parcel from imported trades",
      treatment.pensionPhase
        ? "pension phase; gain is exempt current pension income"
        : undated ? "no acquisition date; taxable figure assumes no discount" : `discount rate ${(lot.discountRate * 100).toFixed(0)}%`,
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
      discountEligibility(lot.acquisitionDate, lot.discountEligible, treatment),
      money(lot.taxableGainIfSoldAud),
    ]);
  }

  addRealisedRows(rows, data, realisedLots, treatment, period);

  /*
   * The export carried no warnings of any kind, so a figure resting on an assumption left this
   * file looking exactly like one that did not. A foreign row with no rate is valued at parity,
   * and anyone reading these totals has to be told which ones that touches.
   */
  if (missingFx.length) {
    const currencies = [...new Set(missingFx.map((row) => row.currency))].sort();
    rows.push([
      "data_quality",
      ownerLabel(data),
      "Missing exchange rates",
      "",
      "",
      "", "", "", "", "", "", "", currencies.join(" "), "",
      `${missingFx.length} ${currencies.join("/")} transaction${missingFx.length === 1 ? " has" : "s have"} no exchange rate, `
        + "so their Australian dollar amounts are assumed at parity rather than measured. "
        + "Every total above that includes them is provisional.",
      data.lastUpdated,
    ]);
    for (const row of missingFx) {
      rows.push([
        "data_quality",
        ownerLabel(data),
        "No exchange rate on record",
        row.symbol,
        "",
        "", "", "", "", "", "", "", row.currency, row.tradeDate,
        `${row.type} from ${row.source}; Australian dollar value assumed at parity`,
        data.lastUpdated,
      ]);
    }
  }
}

/**
 * Disposals that fell inside the requested period.
 *
 * This is the section a date range is actually for: unlike an open position, a disposal happened on
 * a date and stays on it, so scoping it needs no historical prices and loses no accuracy. Each row
 * carries its own acquisition date, which is what makes a reported gain checkable.
 *
 * Gains and losses are listed and summed, not netted in the order the ATO requires — losses apply
 * to undiscounted gains first, which changes the tax. That ordering lives in the EOFY report, and
 * the summary row below says so rather than implying this total is a return figure.
 */
function addRealisedRows(
  rows: CsvRow[],
  data: DashboardData,
  realisedLots: ReturnType<typeof buildTaxLots>["realisedLots"],
  treatment: TaxTreatment,
  period: ReportPeriod,
) {
  const disposals = realisedLots.filter((lot) => dateInRange(lot.saleDate, period.startDate, period.endDate));
  if (!disposals.length) return;

  const proceeds = disposals.reduce((sum, lot) => sum + lot.proceedsAud, 0);
  const cost = disposals.reduce((sum, lot) => sum + lot.costAud, 0);
  const gains = disposals.reduce((sum, lot) => lot.realisedGainAud > 0 ? sum + lot.realisedGainAud : sum, 0);
  const losses = disposals.reduce((sum, lot) => lot.realisedGainAud < 0 ? sum + Math.abs(lot.realisedGainAud) : sum, 0);
  const taxable = disposals.reduce((sum, lot) => sum + lot.taxableGainAud, 0);
  const unmatched = disposals.filter((lot) => !lot.acquisitionDate);

  rows.push([
    "cgt_realised_summary",
    ownerLabel(data),
    `Realised disposals, ${period.label}`,
    "",
    "",
    money(cost),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    `${disposals.length} disposals; gross gains ${money(gains)}; gross losses ${money(losses)}; `
      + "losses are listed, not applied to gains in ATO order, so this is not a return figure — see the EOFY report"
      + (unmatched.length ? `; ${unmatched.length} disposals have no matched acquisition, so their gain is reported as nil rather than measured` : "")
      + (treatment.pensionPhase ? "; pension phase, so these gains are exempt current pension income" : ""),
    data.lastUpdated,
    "",
    "",
    treatment.pensionPhase ? "exempt" : "",
    "",
    `${period.startDate} to ${period.endDate}`,
    money(proceeds),
    money(gains - losses),
    money(taxable),
    [...new Set(disposals.map((lot) => parcelSelectionLabels[lot.selectionMethod]))].sort().join(" / "),
  ]);

  for (const lot of disposals) {
    rows.push([
      "cgt_disposal",
      ownerLabel(data),
      lot.name,
      lot.symbol,
      lot.broker,
      money(lot.costAud),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      [
        `${lot.quantity.toLocaleString("en-AU", { maximumFractionDigits: 6 })} units`,
        lot.exchange,
        treatment.pensionPhase ? "pension phase; gain is exempt current pension income" : `discount rate ${(lot.discountRate * 100).toFixed(0)}%`,
        lot.note,
      ].filter(Boolean).join("; "),
      data.lastUpdated,
      lot.acquisitionDate ?? "",
      lot.heldDays ?? "",
      discountEligibility(lot.acquisitionDate, lot.discountEligible, treatment),
      "",
      lot.saleDate,
      money(lot.proceedsAud),
      money(lot.realisedGainAud),
      money(lot.taxableGainAud),
      parcelSelectionLabels[lot.selectionMethod],
    ]);
  }
}

function addDividendRows(rows: CsvRow[], data: DashboardData, transactions: StoredTransaction[], period: ReportPeriod) {
  const dividends = transactions.filter((transaction) =>
    transaction.type === "DIVIDEND" && dateInRange(transaction.tradeDate, period.startDate, period.endDate));
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
    `Payments ${dividends.length}${period.scoped ? `, paid within ${period.label}` : ""}`,
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
  const params = new URL(request.url).searchParams;
  /*
   * Read the request before touching storage, so a malformed date range answers 400 rather than
   * 500. A 500 says the server broke and invites a retry; this one is answered by fixing the URL.
   */
  let period: ReportPeriod;
  try {
    period = reportPeriod(params);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unusable date range" }, { status: 400 });
  }

  try {
    const selectedScopes = reportScopes(params.get("scope"));
    const storage = getStorage();
    const dashboards = await Promise.all(selectedScopes.map((scope) => storage.dashboard(scope)));
    const transactionsByScope = await Promise.all(selectedScopes.map((scope) => storage.listTransactions(ownerTypeForScope(scope))));
    const taxProfiles = await storage.listTaxProfiles();
    const reportAnchor = dashboards[0];
    const rows: CsvRow[] = [
      header,
      [
        "metadata",
        filenameScope(selectedScopes),
        "SouthernStar tax position",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        `Generated ${new Date().toISOString()}; period ${period.label}; unrealised positions as at `
          + `${reportDate(reportAnchor)}, with realised disposals and dividend income within the period`,
        reportAnchor.lastUpdated,
        "",
        "",
        "",
        "",
        `${period.startDate} to ${period.endDate}`,
      ],
    ];
    dashboards.forEach((dashboard, index) => {
      const profile = taxProfiles.find((item) => item.ownerType === ownerTypeForScope(selectedScopes[index]));
      const pensionPhase = profile?.pensionPhase ?? false;
      addTaxRows(rows, dashboard, transactionsByScope[index] ?? [], { pensionPhase }, period, profile?.parcelSelection);
      addDividendRows(rows, dashboard, transactionsByScope[index] ?? [], period);
    });

    const body = csv(rows);
    const periodSuffix = period.scoped ? `-${period.label.replaceAll(" ", "")}` : "";
    const filename = `southernstar-tax-position-${filenameScope(selectedScopes)}${periodSuffix}-${reportDate(reportAnchor)}.csv`;
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
