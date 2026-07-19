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
const emptyDistributionRows = [["None"], ["Total"]];

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

function sum<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function groupedBy<T>(rows: T[], keyFor: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row) || "Other";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function reportIntro(report: EofyReport, titleText: string): Row[] {
  return [
    title(titleText),
    subtitle(`${report.ownerLabel} | ${report.financialYear.label}: ${report.financialYear.startDate} to ${report.financialYear.endDate}`),
    subtitle(`Generated ${report.generatedAt.slice(0, 10)} | Current valuation reference ${report.valuationAsOf ?? "not recorded"}`),
    blank,
  ];
}

function sharesightCgtIntro(report: EofyReport, sectionText: string): Row[] {
  return [
    title(`Australian Capital Gains Tax Report for ${report.ownerLabel}`),
    subtitle(`Showing capital gains from ${report.financialYear.startDate} to ${report.financialYear.endDate}`),
    subtitle("Sale allocation method assigned for this reporting period: FIFO unless row notes state otherwise"),
    blank,
    section(sectionText),
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

function realisedDetailRow(lot: RealisedTaxLot): Row {
  return [
    lot.name,
    lot.exchange,
    lot.symbol,
    lot.note.includes("Minimise") ? "Minimise CGT" : "FIFO",
    lot.acquisitionDate ?? "",
    lot.saleDate,
    num(lot.heldDays),
    lot.discountEligible ? "Yes" : "No",
    num(lot.quantity),
    money(lot.costAud),
    money(lot.proceedsAud),
    money(lot.realisedGainAud),
    money(lot.taxableGainAud),
    lot.note,
  ];
}

function realisedTableRows(lots: RealisedTaxLot[], finalColumn: "Gain" | "Loss"): Row[] {
  const total = sum(lots, (lot) => lot.realisedGainAud);
  return [
    header(["Name", "Market", "Code", "Sale Allocation Method", "Purchase Date", "Gain Date", "Sold Quantity", "Cost Base", "Sales Value", finalColumn]),
    ...lots.map((lot) => realisedLotRow(lot, finalColumn)),
    totalRow("Total", [null, null, null, null, null, null, null, null, total]),
  ];
}

function cgtCapitalGainsSheet(report: EofyReport): XlsxSheet {
  const cgt = report.capitalGains.summary;
  return {
    name: "Capital gains or losses",
    columns: [54, 18, 18],
    rows: [
      ...sharesightCgtIntro(report, "Capital gains or losses"),
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
    ],
  };
}

function cgtAllHoldingsSheet(report: EofyReport): XlsxSheet {
  const cgt = report.capitalGains.summary;
  const rows = report.capitalGains.byHolding.map((row): Row => [
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
    name: "All holdings",
    columns: [34, 16, 14, 18, 18, 18, 16, 18, 16, 18],
    rows: [
      ...sharesightCgtIntro(report, "All holdings"),
      header(["Name", "Market", "Code", "Sold Quantity", "Short Term Gains", "Long Term Gains", "Non Disc. Dist.", "Disc. Dist. (gross)", "Losses", "Total Gain"]),
      ...rows,
      totalRow("Total", [
        null,
        null,
        sum(report.capitalGains.byHolding, (row) => row.soldQuantity),
        cgt.shortTermGainsAud,
        cgt.longTermGainsAud,
        0,
        0,
        cgt.lossesAud,
        cgt.totalCurrentYearCapitalGainsAud,
      ]),
    ],
  };
}

function cgtBucketSheet(report: EofyReport, name: string, lots: RealisedTaxLot[], finalColumn: "Gain" | "Loss"): XlsxSheet {
  return {
    name,
    columns: [34, 16, 14, 22, 14, 14, 16, 16, 16, 16],
    rows: [
      ...sharesightCgtIntro(report, name),
      ...realisedTableRows(lots, finalColumn),
    ],
  };
}

function cgtDistributionSheet(report: EofyReport, name: "Non-discounted distributions" | "Discounted distributions"): XlsxSheet {
  const finalColumn = name === "Discounted distributions" ? "Discounted Gain" : "Gain";
  return {
    name,
    columns: [34, 16, 14, 14, 16],
    rows: [
      ...sharesightCgtIntro(report, name),
      header(["Name", "Market", "Code", "Gain Date", finalColumn]),
      ...emptyDistributionRows,
    ],
  };
}

function cgtExemptionsSheet(report: EofyReport): XlsxSheet {
  return {
    name: "Exemptions",
    columns: [34, 16, 14, 22, 14, 14, 16, 16, 16, 16],
    rows: [
      ...sharesightCgtIntro(report, "Exemptions"),
      header(["Name", "Market", "Code", "Sale Allocation Method", "Purchase Date", "Gain Date", "Sold Quantity", "Cost Base", "Sales Value", "Gain/loss"]),
      ["None"],
      ["Total"],
    ],
  };
}

function reconciliationSheet(report: EofyReport): XlsxSheet {
  return {
    name: "Reconciliation",
    columns: [18, 30, 18, 18, 16, 12, 58],
    rows: [
      ...reportIntro(report, "Accountant Reconciliation"),
      subtitle(`Overall status: ${report.reconciliation.status.toUpperCase()} | Variance tolerance $${report.reconciliation.varianceToleranceAud.toFixed(2)} AUD`),
      header(["Area", "Check", "NorthStar Amount", "Reference Amount", "Variance", "Status", "Detail"]),
      ...report.reconciliation.rows.map((row): Row => [
        row.section,
        row.check,
        money(row.reportedAud),
        money(row.referenceAud),
        money(row.varianceAud),
        row.status.toUpperCase(),
        row.detail,
      ]),
      blank,
      subtitle("Review rows are intentionally conservative and indicate where broker statements, price history or acquisition history should be checked."),
    ],
  };
}

function accountSummarySheet(report: EofyReport): XlsxSheet {
  return {
    name: "Account Summary",
    columns: [18, 18, 14, 14, 14, 14, 16, 16, 16, 16, 16, 16],
    rows: [
      ...reportIntro(report, "Personal Account Coverage"),
      subtitle("All rows in this workbook are Personal only. Multiple Directshares accounts are included when they are stored under the Personal owner."),
      header(["Broker", "Account", "Trades", "Buys", "Sells", "Income Payments", "Buy Cost", "Sell Proceeds", "Net Income", "Trade Fees", "Current Cost", "Current Value"]),
      ...report.accountSummaries.map((row): Row => [
        row.broker,
        row.accountKey,
        num(row.tradeMovements),
        num(row.buyTrades),
        num(row.sellTrades),
        num(row.incomePayments),
        money(row.buysAud),
        money(row.sellsAud),
        money(row.netIncomeAud),
        money(row.tradeFeesAud),
        money(row.currentCostBaseAud),
        money(row.currentMarketValueAud),
      ]),
      [
        xlsxCell("Total", "section"),
        "",
        num(sum(report.accountSummaries, (row) => row.tradeMovements)),
        num(sum(report.accountSummaries, (row) => row.buyTrades)),
        num(sum(report.accountSummaries, (row) => row.sellTrades)),
        num(sum(report.accountSummaries, (row) => row.incomePayments)),
        money(sum(report.accountSummaries, (row) => row.buysAud)),
        money(sum(report.accountSummaries, (row) => row.sellsAud)),
        money(sum(report.accountSummaries, (row) => row.netIncomeAud)),
        money(sum(report.accountSummaries, (row) => row.tradeFeesAud)),
        money(sum(report.accountSummaries, (row) => row.currentCostBaseAud)),
        money(sum(report.accountSummaries, (row) => row.currentMarketValueAud)),
      ],
    ],
  };
}

function realisedCgtLotsSheet(report: EofyReport): XlsxSheet {
  const lots = [...report.realisedLots].sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.symbol.localeCompare(b.symbol));
  return {
    name: "Realised CGT Lots",
    columns: [34, 14, 14, 18, 14, 14, 16, 16, 14, 16, 16, 16, 16, 52],
    rows: [
      ...reportIntro(report, "Realised Capital Gains Tax Lots"),
      subtitle("Personal portfolio only. Amounts are AUD and use FIFO unless a row note states otherwise."),
      header(["Name", "Market", "Code", "Sale Allocation Method", "Purchase Date", "Sale Date", "Holding Period Days", "Discount Eligible", "Sold Quantity", "Cost Base", "Sales Value", "Capital Gain/Loss", "Taxable Gain", "Note"]),
      ...lots.map(realisedDetailRow),
      [
        xlsxCell("Total", "section"),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        num(lots.reduce((sum, lot) => sum + lot.quantity, 0)),
        money(lots.reduce((sum, lot) => sum + lot.costAud, 0)),
        money(lots.reduce((sum, lot) => sum + lot.proceedsAud, 0)),
        money(lots.reduce((sum, lot) => sum + lot.realisedGainAud, 0)),
        money(report.capitalGains.summary.netCapitalGainAud),
        "",
      ],
      blank,
      subtitle("The Taxable Gain total reflects current-year capital losses and the CGT discount after loss offset, matching the CGT Summary sheet."),
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
    name: "Taxable Income Report",
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
    row.broker,
    row.accountKey,
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

function allTradesRows(rows: EofyTradeMovement[]): Row[] {
  return [
    header(["Code", "Market Code", "Name", "Broker", "Account", "Date", "Type", "Qty", "Price", "Instrument Currency", "Cost Base Per Share (AUD)", "Brokerage", "Brokerage Currency", "Exch. Rate", "Value"]),
    ...rows.map(tradeRow),
    [
      xlsxCell("Total", "section"),
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
      "",
      "",
      money(sum(rows, (row) => row.type === "SELL" ? -Math.abs(row.netCashAud || row.grossAud) : row.grossAud + row.feesAud + row.taxesAud)),
    ],
  ];
}

function allTradesSheet(report: EofyReport, name = "All Trades", rows = report.tradeMovements, groupLabel?: string): XlsxSheet {
  return {
    name,
    columns: [14, 14, 34, 18, 18, 14, 12, 14, 14, 16, 18, 14, 16, 14, 16],
    rows: [
      ...reportIntro(report, "All Trades Report"),
      ...(groupLabel ? [section(groupLabel)] : []),
      ...allTradesRows(rows),
    ],
  };
}

function allTradeMarketSheets(report: EofyReport): XlsxSheet[] {
  return groupedBy(report.tradeMovements, (row) => row.exchange)
    .map(([market, rows]) => allTradesSheet(report, `Trades ${market}`, rows, `Grouping ${market}`));
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
    num(row.closingQuantity),
    num(row.closingPrice),
    row.closingPriceCurrency ?? "",
    row.closingPriceDate ?? "",
    num(row.closingFxRateToAud),
    row.closingValuationStatus,
    row.closingValuationSource ?? "",
  ];
}

function historicalCostSheet(report: EofyReport, name = "Historical Cost", rows = report.historicalCost, groupLabel?: string): XlsxSheet {
  const sum = (pick: (row: EofyHistoricalCostRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return {
    name,
    columns: [14, 14, 34, 16, 16, 18, 16, 16, 16, 18, 16, 18, 14, 12, 14, 14, 18, 28, 16],
    rows: [
      ...reportIntro(report, "Historical Cost Report"),
      ...(groupLabel ? [section(groupLabel)] : []),
      subtitle("Including brokerage. Closing market value uses stored close prices at or before 30 June where available."),
      header(["Market", "Code", "Name", "Allocation Method", "Opening Balance*", "Opening Market Value", "Opening Quantity", "Purchases*", "Cost Of Sales*", "Capital Adjustments", "Closing Balance*", "Closing Market Value", "Closing Quantity", "Closing Price", "Currency", "Price Date", "FX To AUD", "Valuation Status", "Valuation Source"]),
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
        num(sum((row) => row.closingQuantity)),
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      blank,
      subtitle("All amounts converted to Australian Dollars."),
    ],
  };
}

function historicalCostMarketSheets(report: EofyReport): XlsxSheet[] {
  return groupedBy(report.historicalCost, (row) => row.market)
    .map(([market, rows]) => historicalCostSheet(report, `Cost ${market}`, rows, `Grouping ${market}`));
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
    name: "Unrealised CGT Report",
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
    reconciliationSheet(report),
    accountSummarySheet(report),
    cgtCapitalGainsSheet(report),
    cgtAllHoldingsSheet(report),
    cgtBucketSheet(report, "Short term gains", report.capitalGains.shortTerm, "Gain"),
    cgtBucketSheet(report, "Long term gains", report.capitalGains.longTerm, "Gain"),
    cgtBucketSheet(report, "Losses", report.capitalGains.losses, "Loss"),
    cgtDistributionSheet(report, "Non-discounted distributions"),
    cgtDistributionSheet(report, "Discounted distributions"),
    cgtExemptionsSheet(report),
    realisedCgtLotsSheet(report),
    taxableIncomeSheet(report),
    allTradesSheet(report),
    ...allTradeMarketSheets(report),
    historicalCostSheet(report),
    ...historicalCostMarketSheets(report),
    unrealisedCgtSheet(report),
  ]);
}
