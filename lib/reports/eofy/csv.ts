import type { OpenTaxLot } from "@/lib/tax-lots";
import type { EofyReport } from "./types";

type CsvCell = string | number | null | undefined;
type CsvRow = CsvCell[];

function csvCell(value: CsvCell) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function money(value: number) {
  return value.toFixed(2);
}

function number(value: number | null | undefined) {
  return value == null ? "" : value.toFixed(6).replace(/\.?0+$/, "");
}

function csv(rows: CsvRow[]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function addSharesightCompatibilityRows(rows: CsvRow[], report: EofyReport) {
  const cgt = report.capitalGains.summary;
  const cgtSummaryRows: Array<[string, number, string]> = [
    ["Short term capital gains", cgt.shortTermGainsAud, "Capital gains on shares applicable for 'other' method"],
    ["Long term capital gains", cgt.longTermGainsAud, "Capital gains on shares applicable for discount method"],
    ["Capital losses available to offset", cgt.lossesAud, "Current-year realised capital losses"],
    ["Total current year capital gains (18H)", cgt.totalCurrentYearCapitalGainsAud, "Sharesight-style 18H total before losses and discount"],
    ["Short term gains after losses", cgt.shortTermGainsAfterLossesAud, "Losses offset against short-term gains first"],
    ["Long term gains after losses", cgt.longTermGainsAfterLossesAud, "Remaining long-term gains before concession"],
    [`Less CGT concession amount at ${Math.round(cgt.discountRate * 100)}%`, -cgt.cgtConcessionAud, "Discount applied after loss offset"],
    ["Total net capital gain (18A)", cgt.netCapitalGainAud, "Sharesight-style 18A net capital gain"],
  ];

  for (const [label, value, detail] of cgtSummaryRows) {
    rows.push([
      "sharesight_cgt_summary",
      report.ownerLabel,
      report.financialYear.label,
      label,
      "",
      "",
      report.financialYear.startDate,
      report.financialYear.endDate,
      "",
      "AUD",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      money(value),
      label.includes("18A") ? money(value) : "",
      detail,
      report.financialYear.endDate,
    ]);
  }

  for (const row of report.capitalGains.byHolding) {
    rows.push([
      "sharesight_cgt_all_holdings",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.code,
      row.market,
      "",
      "",
      number(row.soldQuantity),
      "AUD",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      money(row.totalGainAud + row.lossesAud),
      "",
      `Short term ${money(row.shortTermGainsAud)}; long term ${money(row.longTermGainsAud)}; losses ${money(row.lossesAud)}; total gains ${money(row.totalGainAud)}`,
      report.financialYear.endDate,
    ]);
  }

  for (const row of report.taxableIncome.australianNonTrust) {
    rows.push([
      "sharesight_taxable_income_au_non_trust",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.code,
      "",
      row.paidDate,
      "",
      "",
      "AUD",
      money(row.totalIncomeAud),
      money(row.netAmountAud),
      money(row.frankingCreditsAud),
      money(row.foreignIncomeTaxAud + row.tfnWithholdingAud),
      "",
      "",
      "",
      "",
      "",
      `Franked ${money(row.frankedAmountAud)}; unfranked ${money(row.unfrankedAmountAud)}; tax deferred ${money(row.taxDeferredAud)}; gross dividend ${money(row.grossDividendAud)}; ${row.comments}`,
      row.paidDate,
    ]);
  }

  for (const row of report.taxableIncome.australianTrust) {
    rows.push([
      "sharesight_taxable_income_au_trust",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.code,
      "",
      row.paidDate,
      "",
      "",
      "AUD",
      money(row.totalIncomeAud),
      money(row.netAmountAud),
      money(row.frankingCreditsAud),
      money(row.foreignIncomeTaxAud + row.tfnWithholdingAud),
      "",
      money(row.amitCostBaseDecreaseAud - row.amitCostBaseIncreaseAud),
      "",
      money(row.capitalGainsAud + row.discountedCapitalGainsAud),
      "",
      `Franked ${money(row.frankedAmountAud)}; unfranked ${money(row.unfrankedAmountAud)}; AMIT decrease ${money(row.amitCostBaseDecreaseAud)}; AMIT increase ${money(row.amitCostBaseIncreaseAud)}; gross dividend ${money(row.grossDividendAud)}; ${row.comments}`,
      row.paidDate,
    ]);
  }

  for (const row of report.taxableIncome.foreign) {
    rows.push([
      "sharesight_taxable_income_foreign",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.code,
      "",
      row.paidDate,
      "",
      "",
      row.currency,
      money(row.grossAmountAud),
      money(row.netAmountAud),
      "",
      money(row.foreignTaxWithheldAud),
      "",
      "",
      "",
      "",
      "",
      `Country ${row.country}; exchange rate ${row.exchangeRate ?? ""}; ${row.incomeType}; ${row.comments}`,
      row.paidDate,
    ]);
  }

  for (const row of report.historicalCost) {
    rows.push([
      "sharesight_historical_cost",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.code,
      row.market,
      report.financialYear.startDate,
      report.financialYear.endDate,
      number(row.closingQuantity),
      "AUD",
      "",
      "",
      "",
      "",
      "",
      money(row.closingBalanceAud),
      row.closingMarketValueAud == null ? "" : money(row.closingMarketValueAud),
      "",
      "",
      `Method ${row.allocationMethod}; opening balance ${money(row.openingBalanceAud)}; opening quantity ${number(row.openingQuantity)}; purchases ${money(row.purchasesAud)}; cost of sales ${money(row.costOfSalesAud)}; capital adjustments ${money(row.capitalAdjustmentsAud)}; closing quantity ${number(row.closingQuantity)}; valuation ${row.closingValuationStatus}; price ${number(row.closingPrice)} ${row.closingPriceCurrency ?? ""} on ${row.closingPriceDate ?? ""}; FX ${number(row.closingFxRateToAud)}; source ${row.closingValuationSource ?? ""}`,
      report.financialYear.endDate,
    ]);
  }

  const unrealisedBuckets: Array<[string, OpenTaxLot[]]> = [
    ["sharesight_unrealised_cgt_short_term", report.unrealisedCgt.shortTerm],
    ["sharesight_unrealised_cgt_long_term", report.unrealisedCgt.longTerm],
    ["sharesight_unrealised_cgt_losses", report.unrealisedCgt.losses],
  ];
  for (const [section, lots] of unrealisedBuckets) {
    for (const lot of lots) {
      rows.push([
        section,
        report.ownerLabel,
        report.financialYear.label,
        lot.name,
        lot.symbol,
        lot.exchange,
        lot.acquisitionDate,
        "",
        number(lot.quantity),
        "AUD",
        "",
        "",
        "",
        "",
        "",
        money(lot.costAud),
        money(lot.marketValueAud),
        money(lot.unrealisedGainAud),
        money(lot.taxableGainIfSoldAud),
        `${lot.source}; held ${lot.heldDays ?? "unknown"} days; ${lot.discountEligible ? "discount eligible" : "not discount eligible"}; ${lot.note}`,
        lot.asOfDate,
      ]);
    }
  }
}

export function eofyReportCsv(report: EofyReport) {
  const rows: CsvRow[] = [[
    "section",
    "owner",
    "financial_year",
    "item",
    "symbol",
    "broker",
    "trade_date",
    "settle_date",
    "quantity",
    "currency",
    "gross_income_aud",
    "net_income_aud",
    "franking_credits_aud",
    "tax_withheld_aud",
    "fees_aud",
    "cost_base_aud",
    "proceeds_aud",
    "capital_gain_aud",
    "taxable_gain_aud",
    "detail",
    "as_of",
  ]];

  rows.push([
    "metadata",
    report.ownerLabel,
    report.financialYear.label,
    "NorthStar EOFY accountant pack",
    "",
    "",
    report.financialYear.startDate,
    report.financialYear.endDate,
    "",
    "AUD",
    money(report.summary.grossIncomeAud),
    money(report.summary.netIncomeAud),
    money(report.summary.frankingCreditsAud),
    money(report.summary.taxWithheldAud),
    money(report.summary.feesAud),
    money(report.summary.currentCostBaseAud),
    money(report.summary.sellsAud),
    money(report.summary.netRealisedAud),
    money(report.summary.taxableRealisedAud),
    `Generated ${report.generatedAt}; current valuation reference ${report.valuationAsOf ?? "not recorded"}`,
    report.valuationAsOf,
  ]);

  addSharesightCompatibilityRows(rows, report);

  for (const row of report.accountSummaries) {
    rows.push([
      "account_summary",
      report.ownerLabel,
      report.financialYear.label,
      `${row.broker} account ${row.accountKey}`,
      "",
      row.broker,
      report.financialYear.startDate,
      report.financialYear.endDate,
      row.currentHoldings,
      "AUD",
      money(row.grossIncomeAud),
      money(row.netIncomeAud),
      "",
      "",
      money(row.tradeFeesAud),
      money(row.currentCostBaseAud),
      money(row.currentMarketValueAud),
      "",
      "",
      `${row.tradeMovements} trade movement${row.tradeMovements === 1 ? "" : "s"}; ${row.buyTrades} buy; ${row.sellTrades} sell; ${row.incomePayments} income payment${row.incomePayments === 1 ? "" : "s"}; buy cost ${money(row.buysAud)}; sell proceeds ${money(row.sellsAud)}`,
      report.financialYear.endDate,
    ]);
  }

  for (const row of report.reconciliation.rows) {
    rows.push([
      "accountant_reconciliation",
      report.ownerLabel,
      report.financialYear.label,
      row.check,
      row.section,
      "",
      report.financialYear.startDate,
      report.financialYear.endDate,
      "",
      "AUD",
      "",
      "",
      "",
      "",
      "",
      row.reportedAud == null ? "" : money(row.reportedAud),
      row.referenceAud == null ? "" : money(row.referenceAud),
      row.varianceAud == null ? "" : money(row.varianceAud),
      "",
      `${row.status.toUpperCase()}: ${row.detail}`,
      report.financialYear.endDate,
    ]);
  }

  for (const row of report.incomeBySymbol) {
    rows.push([
      "income_summary",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.symbol,
      "",
      "",
      "",
      row.payments,
      "AUD",
      money(row.grossIncomeAud),
      money(row.netIncomeAud),
      money(row.frankingCreditsAud),
      money(row.taxWithheldAud),
      money(row.feesAud),
      "",
      "",
      "",
      "",
      `${row.payments} payment${row.payments === 1 ? "" : "s"}`,
      report.financialYear.endDate,
    ]);
  }

  for (const row of report.incomePayments) {
    rows.push([
      "income_payment",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.symbol,
      row.broker,
      row.paymentDate,
      row.exDate,
      number(row.units),
      row.currency,
      money(row.grossIncomeAud),
      money(row.netIncomeAud),
      money(row.frankingCreditsAud),
      money(row.taxWithheldAud),
      money(row.feesAud),
      "",
      "",
      "",
      "",
      `${row.source}; account ${row.accountKey}`,
      row.paymentDate,
    ]);
  }

  for (const row of report.realisedLots) {
    rows.push([
      "realised_cgt_lot",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.symbol,
      row.broker,
      row.saleDate,
      "",
      number(row.quantity),
      "AUD",
      "",
      "",
      "",
      "",
      "",
      money(row.costAud),
      money(row.proceedsAud),
      money(row.realisedGainAud),
      money(row.taxableGainAud),
      `${row.note}; acquired ${row.acquisitionDate ?? "unknown"}; held ${row.heldDays ?? "unknown"} days; discount ${row.discountEligible ? `${Math.round(row.discountRate * 100)}%` : "not eligible"}`,
      row.saleDate,
    ]);
  }

  for (const row of report.tradeMovements) {
    rows.push([
      "trade_movement",
      report.ownerLabel,
      report.financialYear.label,
      row.type,
      row.symbol,
      row.broker,
      row.tradeDate,
      row.settleDate,
      number(row.quantity),
      row.currency,
      "",
      money(row.netCashAud),
      "",
      money(row.taxesAud),
      money(row.feesAud),
      row.type === "BUY" ? money(row.grossAud + row.feesAud + row.taxesAud) : "",
      row.type === "SELL" ? money(Math.abs(row.netCashAud || row.grossAud)) : "",
      "",
      "",
      `${row.source}; account ${row.accountKey}`,
      row.tradeDate,
    ]);
  }

  for (const row of report.currentHoldings) {
    rows.push([
      "current_holding_reference",
      report.ownerLabel,
      report.financialYear.label,
      row.name,
      row.symbol,
      row.broker,
      "",
      "",
      number(row.quantity),
      row.currency,
      "",
      "",
      "",
      "",
      "",
      money(row.costAud),
      money(row.marketValueAud),
      money(row.unrealisedAud),
      "",
      `${row.sector}; account ${row.accountKey}; current valuation reference; ${row.source}`,
      row.asOfDate,
    ]);
  }

  for (const note of report.dataQuality) {
    rows.push(["data_quality", report.ownerLabel, report.financialYear.label, note, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", report.generatedAt]);
  }

  return csv(rows);
}
