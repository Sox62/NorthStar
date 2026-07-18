import type {
  EofyAustralianIncomeRow,
  EofyForeignIncomeRow,
  EofyHistoricalCostRow,
  EofyReport,
  EofyTradeMovement,
} from "@/lib/reports/eofy";
import type { OpenTaxLot, RealisedTaxLot } from "@/lib/tax-lots";
import { createXlsx, xlsxCell, type XlsxSheet } from "@/lib/reports/xlsx";

type Row = XlsxSheet["rows"][number];

const blank: Row = [];

function money(value: number | null | undefined) {
  return xlsxCell(value ?? null, "money");
}

function num(value: number | null | undefined) {
  return xlsxCell(value ?? null, "number");
}

function title(value: string): Row {
  return [xlsxCell(value, "title")];
}

function subtitle(value: string): Row {
  return [xlsxCell(value, "subtitle")];
}

function section(value: string): Row {
  return [xlsxCell(value, "section")];
}

function header(values: string[]): Row {
  return values.map((value) => xlsxCell(value, "header"));
}

function totalRow(label: string, values: Array<number | null | undefined>): Row {
  return [xlsxCell(label, "section"), ...values.map((value) => money(value))];
}

function reportIntro(report: EofyReport, titleText: string): Row[] {
  return [
    title(titleText),
    subtitle(`${report.ownerLabel} | ${report.financialYear.label}: ${report.financialYear.startDate} to ${report.financialYear.endDate}`),
    subtitle(`Generated ${report.generatedAt.slice(0, 10)} | Current valuation reference ${report.valuationAsOf ?? "not recorded"}`),
    blank,
  ];
}

function realisedLotRow(lot: RealisedTaxLot, amountLabel: "Gain" | "Loss"): Row {
  return [
    lot.name,
    lot.exchange,
    lot.symbol,
    lot.note.includes("Minimise") ? "Minimise CGT" : "FIFO",
    lot.acquisitionDate ?? "",
    lot.saleDate,
    num(lot.quantity),
    money(lot.costAud),
    money(lot.proceedsAud),
    money(amountLabel === "Loss" ? lot.realisedGainAud : lot.realisedGainAud),
  ];
}

function realisedTable(titleText: string, lots: RealisedTaxLot[], finalColumn: "Gain" | "Loss"): Row[] {
  const total = lots.reduce((sum, lot) => sum + lot.realisedGainAud, 0);
  return [
    section(titleText),
    header(["Name", "Market", "Code", "Sale Allocation Method", "Purchase Date", "Gain Date", "Sold Quantity", "Cost Base", "Sales Value", finalColumn]),
    ...lots.map((lot) => realisedLotRow(lot, finalColumn)),
    totalRow("Total", [null, null, null, null, null, null, null, null, total]),
    blank,
  ];
}

function cgtSummarySheet(report: EofyReport): XlsxSheet {
  const cgt = report.capitalGains.summary;
  const allHoldingsRows = report.capitalGains.byHolding.map((row): Row => [
    row.name,
    row.market,
    row.code,
    num(row.soldQuantity),
    money(row.shortTermGainsAud),
    money(row.longTermGainsAud),
    money(0),
    money(0),
    money(row.lossesAud),
    money(row.totalGainAud),
  ]);

  return {
    name: "CGT Summary",
    columns: [34, 16, 14, 18, 18, 18, 16, 18, 16, 18],
    rows: [
      ...reportIntro(report, "Australian Capital Gains Tax Report"),
      section("Capital gains or losses"),
      ["Total current year capital gains (18H)"],
      ["Short term capital gains", money(cgt.shortTermGainsAud)],
      ["Long term capital gains", money(cgt.longTermGainsAud)],
      ["Non discounted capital gain distributions", money(cgt.nonDiscountedDistributionsAud)],
      ["Discounted capital gain distribution (grossed up)", money(cgt.discountedDistributionsGrossAud)],
      ["Total current year capital gains", money(cgt.totalCurrentYearCapitalGainsAud)],
      blank,
      ["Net capital gain (18A)"],
      ["Capital gains on shares applicable for other method", money(cgt.shortTermGainsAud)],
      ["Less capital losses available to be offset", money(cgt.lossesAud), money(cgt.shortTermGainsAfterLossesAud)],
      ["Capital gains on shares applicable for discount method", money(cgt.longTermGainsAud)],
      [`Less CGT concession amount at ${Math.round(cgt.discountRate * 100)}%`, null, money(-cgt.cgtConcessionAud)],
      ["Total net capital gain", null, money(cgt.netCapitalGainAud)],
      blank,
      section("All holdings"),
      header(["Name", "Market", "Code", "Sold Quantity", "Short Term Gains", "Long Term Gains", "Non Disc. Dist.", "Disc. Dist. (gross)", "Losses", "Total Gain"]),
      ...allHoldingsRows,
      totalRow("Total", [
        null,
        null,
        report.capitalGains.byHolding.reduce((sum, row) => sum + row.soldQuantity, 0),
        cgt.shortTermGainsAud,
        cgt.longTermGainsAud,
        0,
        0,
        cgt.lossesAud,
        cgt.totalCurrentYearCapitalGainsAud,
      ]),
      blank,
      ...realisedTable("Short term gains", report.capitalGains.shortTerm, "Gain"),
      ...realisedTable("Long term gains", report.capitalGains.longTerm, "Gain"),
      ...realisedTable("Losses", report.capitalGains.losses, "Loss"),
    ],
  };
}

const australianIncomeHeader = [
  "Code",
  "Name",
  "Paid Date",
  "Total Income",
  "Net Amount",
  "Franked Amount",
  "Unfranked Amount",
  "Interest",
  "Tax Deferred",
  "AMIT Cost Base Decrease",
  "AMIT Cost Base Increase",
  "Foreign Source Income",
  "Discounted Capital Gains",
  "Capital Gains",
  "CGT Concession",
  "Non Assessable",
  "TFN WT",
  "Foreign Income Tax",
  "Franking Credits",
  "Other Net FSI",
  "LIC Capital Gain",
  "Gross Dividend",
  "Comments",
];

function australianIncomeRow(row: EofyAustralianIncomeRow): Row {
  return [
    row.code,
    row.name,
    row.paidDate,
    money(row.totalIncomeAud),
    money(row.netAmountAud),
    money(row.frankedAmountAud),
    money(row.unfrankedAmountAud),
    money(row.interestAud),
    money(row.taxDeferredAud),
    money(row.amitCostBaseDecreaseAud),
    money(row.amitCostBaseIncreaseAud),
    money(row.foreignSourceIncomeAud),
    money(row.discountedCapitalGainsAud),
    money(row.capitalGainsAud),
    money(row.cgtConcessionAud),
    money(row.nonAssessableAud),
    money(row.tfnWithholdingAud),
    money(row.foreignIncomeTaxAud),
    money(row.frankingCreditsAud),
    money(row.otherNetForeignSourceIncomeAud),
    money(row.licCapitalGainAud),
    money(row.grossDividendAud),
    row.comments,
  ];
}

function australianIncomeTotals(label: string, rows: EofyAustralianIncomeRow[]): Row {
  const sum = (pick: (row: EofyAustralianIncomeRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return [
    xlsxCell(label, "section"),
    "",
    "",
    money(sum((row) => row.totalIncomeAud)),
    money(sum((row) => row.netAmountAud)),
    money(sum((row) => row.frankedAmountAud)),
    money(sum((row) => row.unfrankedAmountAud)),
    money(sum((row) => row.interestAud)),
    money(sum((row) => row.taxDeferredAud)),
    money(sum((row) => row.amitCostBaseDecreaseAud)),
    money(sum((row) => row.amitCostBaseIncreaseAud)),
    money(sum((row) => row.foreignSourceIncomeAud)),
    money(sum((row) => row.discountedCapitalGainsAud)),
    money(sum((row) => row.capitalGainsAud)),
    money(sum((row) => row.cgtConcessionAud)),
    money(sum((row) => row.nonAssessableAud)),
    money(sum((row) => row.tfnWithholdingAud)),
    money(sum((row) => row.foreignIncomeTaxAud)),
    money(sum((row) => row.frankingCreditsAud)),
    money(sum((row) => row.otherNetForeignSourceIncomeAud)),
    money(sum((row) => row.licCapitalGainAud)),
    money(sum((row) => row.grossDividendAud)),
    "",
  ];
}

function australianIncomeSection(titleText: string, rows: EofyAustralianIncomeRow[]): Row[] {
  return [
    section(titleText),
    header(australianIncomeHeader),
    ...rows.map(australianIncomeRow),
    australianIncomeTotals("Total", rows),
    blank,
  ];
}

function foreignIncomeRow(row: EofyForeignIncomeRow): Row {
  return [
    row.code,
    row.name,
    row.paidDate,
    num(row.exchangeRate),
    row.currency,
    money(row.netAmountAud),
    money(row.foreignTaxWithheldAud),
    money(row.grossAmountAud),
    row.country,
    row.incomeType,
    row.comments,
  ];
}

function taxableIncomeSheet(report: EofyReport): XlsxSheet {
  const foreign = report.taxableIncome.foreign;
  return {
    name: "Taxable Income",
    columns: [14, 34, 14, 14, 14, 14, 14, 14, 14, 18, 18, 18, 18, 14, 14, 14, 14, 16, 16, 14, 14, 16, 40],
    rows: [
      ...reportIntro(report, "Taxable Income Report"),
      section("AU Income"),
      ...australianIncomeSection("Non Trust Income", report.taxableIncome.australianNonTrust),
      ...australianIncomeSection("Trust Income", report.taxableIncome.australianTrust),
      section("Foreign Income"),
      header(["Code", "Name", "Date Paid", "Exchange Rate", "Currency", "Net Amount", "Foreign Tax Withheld/Offset", "Gross Amount", "Country", "Income Type", "Comments"]),
      ...foreign.map(foreignIncomeRow),
      [
        xlsxCell("Total", "section"),
        "",
        "",
        "",
        "",
        money(foreign.reduce((sum, row) => sum + row.netAmountAud, 0)),
        money(foreign.reduce((sum, row) => sum + row.foreignTaxWithheldAud, 0)),
        money(foreign.reduce((sum, row) => sum + row.grossAmountAud, 0)),
        "",
        "",
        "",
      ],
    ],
  };
}

function tradeRow(row: EofyTradeMovement): Row {
  const signedQuantity = row.type === "SELL" ? -row.quantity : row.quantity;
  const brokerage = row.feesAud + row.taxesAud;
  const value = row.type === "SELL" ? -Math.abs(row.netCashAud || row.grossAud) : row.grossAud + brokerage;
  return [
    row.symbol,
    row.exchange,
    row.name,
    row.tradeDate,
    row.type,
    num(signedQuantity),
    num(row.price),
    row.currency,
    "",
    money(brokerage),
    "AUD",
    num(row.fxRateToAud),
    money(value),
  ];
}

function allTradesSheet(report: EofyReport): XlsxSheet {
  return {
    name: "All Trades",
    columns: [14, 14, 34, 14, 12, 14, 14, 16, 18, 14, 16, 14, 16],
    rows: [
      ...reportIntro(report, "All Trades Report"),
      header(["Code", "Market Code", "Name", "Date", "Type", "Qty", "Price", "Instrument Currency", "Cost Base Per Share (AUD)", "Brokerage", "Brokerage Currency", "Exch. Rate", "Value"]),
      ...report.tradeMovements.map(tradeRow),
      ["Total"],
    ],
  };
}

function historicalCostRow(row: EofyHistoricalCostRow): Row {
  return [
    row.market,
    row.code,
    row.name,
    row.allocationMethod,
    money(row.openingBalanceAud),
    money(row.openingMarketValueAud),
    num(row.openingQuantity),
    money(row.purchasesAud),
    money(row.costOfSalesAud),
    money(row.capitalAdjustmentsAud),
    money(row.closingBalanceAud),
    money(row.closingMarketValueAud),
    num(row.closingPrice),
    row.closingPriceCurrency ?? "",
    row.closingPriceDate ?? "",
    num(row.closingFxRateToAud),
    row.closingValuationStatus,
    row.closingValuationSource ?? "",
    num(row.closingQuantity),
  ];
}

function historicalCostSheet(report: EofyReport): XlsxSheet {
  const rows = report.historicalCost;
  const sum = (pick: (row: EofyHistoricalCostRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return {
    name: "Historical Cost",
    columns: [14, 14, 34, 16, 16, 18, 16, 16, 16, 18, 16, 18, 14, 12, 14, 14, 18, 28, 16],
    rows: [
      ...reportIntro(report, "Historical Cost Report"),
      subtitle("Including brokerage. Closing market value uses stored close prices at or before 30 June where available."),
      header(["Market", "Code", "Name", "Allocation Method", "Opening Balance", "Opening Market Value", "Opening Quantity", "Purchases", "Cost Of Sales", "Capital Adjustments", "Closing Balance", "Closing Market Value", "Closing Price", "Currency", "Price Date", "FX To AUD", "Valuation Status", "Valuation Source", "Closing Quantity"]),
      ...rows.map(historicalCostRow),
      [
        xlsxCell("Total", "section"),
        "",
        "",
        "",
        money(sum((row) => row.openingBalanceAud)),
        "",
        num(sum((row) => row.openingQuantity)),
        money(sum((row) => row.purchasesAud)),
        money(sum((row) => row.costOfSalesAud)),
        money(sum((row) => row.capitalAdjustmentsAud)),
        money(sum((row) => row.closingBalanceAud)),
        money(rows.reduce((total, row) => total + (row.closingMarketValueAud ?? 0), 0)),
        "",
        "",
        "",
        "",
        "",
        "",
        num(sum((row) => row.closingQuantity)),
      ],
      blank,
      subtitle("All amounts converted to Australian Dollars."),
    ],
  };
}

function unrealisedLotRow(lot: OpenTaxLot, finalColumn: "Gain" | "Loss"): Row {
  return [
    lot.name,
    lot.symbol,
    lot.note.includes("Minimise") ? "Minimise CGT" : "FIFO",
    lot.acquisitionDate ?? "",
    num(lot.quantity),
    money(lot.costAud),
    money(lot.marketValueAud),
    money(finalColumn === "Loss" ? lot.unrealisedGainAud : lot.unrealisedGainAud),
    lot.asOfDate,
    lot.note,
  ];
}

function unrealisedSection(titleText: string, lots: OpenTaxLot[], finalColumn: "Gain" | "Loss"): Row[] {
  return [
    section(titleText),
    header(["Name", "Code", "Sale Allocation Method", "Purchase Date", "Quantity", "Cost Base", "Market Value", finalColumn, "As Of", "Note"]),
    ...lots.map((lot) => unrealisedLotRow(lot, finalColumn)),
    totalRow("Total", [null, null, null, null, null, null, lots.reduce((sum, lot) => sum + lot.unrealisedGainAud, 0), null, null]),
    subtitle("Please note that quantity may be adjusted where incomplete transaction history requires position fallback data. EOFY market values are used where stored price and FX data are available."),
    blank,
  ];
}

function unrealisedCgtSheet(report: EofyReport): XlsxSheet {
  return {
    name: "Unrealised CGT",
    columns: [34, 14, 18, 14, 14, 16, 16, 16, 14, 52],
    rows: [
      ...reportIntro(report, `Unrealised CGT for ${report.financialYear.endDate}`),
      ...unrealisedSection("Short Term Capital Gains (unrealised)", report.unrealisedCgt.shortTerm, "Gain"),
      ...unrealisedSection("Long Term Capital Gains (unrealised)", report.unrealisedCgt.longTerm, "Gain"),
      ...unrealisedSection("Capital Losses (unrealised)", report.unrealisedCgt.losses, "Loss"),
    ],
  };
}

export function eofyReportXlsx(report: EofyReport) {
  return createXlsx([
    cgtSummarySheet(report),
    taxableIncomeSheet(report),
    allTradesSheet(report),
    historicalCostSheet(report),
    unrealisedCgtSheet(report),
  ]);
}
