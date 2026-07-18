import type { StoredTransaction } from "@/lib/storage";
import type { EofyAustralianIncomeRow, EofyForeignIncomeRow, EofyIncomePayment, EofyIncomeSymbol, EofyTaxableIncomeSections } from "./types";
import { dateInRange, rawAmount, rawString, transactionAud } from "./utils";

function dividendGrossAud(transaction: StoredTransaction, netIncomeAud: number, taxWithheldAud: number, frankingCreditsAud: number) {
  return rawAmount(transaction, ["grossDividendAud", "grossDividend"]) || netIncomeAud + taxWithheldAud + frankingCreditsAud;
}

function dividendFrankingCreditsAud(transaction: StoredTransaction) {
  return rawAmount(transaction, ["frankingCreditAud", "frankingCredit"]);
}

function dividendExDate(transaction: StoredTransaction) {
  const raw = transaction.raw;
  const value = raw?.exDate;
  return typeof value === "string" && value ? value : null;
}

function dividendUnits(transaction: StoredTransaction) {
  const shares = rawAmount(transaction, ["shares", "units", "holdings"]);
  return shares || null;
}

function instrumentCode(transaction: StoredTransaction) {
  const exchange = transaction.exchange ? `.${transaction.exchange}` : "";
  return `${transaction.symbol}${exchange}`;
}

function countryForIncome(transaction: StoredTransaction, currency: string) {
  const exchange = transaction.exchange.toUpperCase();
  if (exchange.includes("NYSE") || exchange === "US" || currency === "USD") return "United States";
  if (exchange.includes("TSX") || exchange === "TSE" || exchange === "CVE" || currency === "CAD") return "Canada";
  if (exchange.includes("LSE") || currency === "GBP") return "United Kingdom";
  return "Australia";
}

function isTrustLikeIncome(transaction: StoredTransaction) {
  const haystack = `${transaction.symbol} ${transaction.description ?? ""}`.toUpperCase();
  return /\b(ETF|ETFS|FUND|TRUST|BETASHARES|VANECK|ISHARES|GLOBAL X|SPROTT|ETP|ETC)\b/.test(haystack);
}

function incomeComment(transaction: StoredTransaction) {
  const rate = rawAmount(transaction, ["grossDividendRateLocal", "centsPerShare"]);
  if (rate) return `Dividend of ${rate} per share`;
  return transaction.source;
}

export function taxableIncomeRows(transactions: StoredTransaction[], startDate: string, endDate: string): EofyTaxableIncomeSections {
  const sections: EofyTaxableIncomeSections = { australianNonTrust: [], australianTrust: [], foreign: [] };

  for (const transaction of transactions) {
    if (transaction.type !== "DIVIDEND" || !dateInRange(transaction.tradeDate, startDate, endDate)) continue;

    const localCurrency = rawString(transaction, ["localCurrency"]) || transaction.currency;
    const netAmountAud = transactionAud(transaction.netCash, transaction);
    const foreignTaxWithheldAud = transactionAud(transaction.taxes, transaction);
    const frankingCreditsAud = dividendFrankingCreditsAud(transaction);
    const totalIncomeAud = dividendGrossAud(transaction, netAmountAud, foreignTaxWithheldAud, 0);
    const frankedAmountAud = rawAmount(transaction, ["frankedAmountAud", "frankedAmount", "franked"]);
    const unfrankedAmountAud = rawAmount(transaction, ["unfrankedAmountAud", "unfrankedAmount", "unfranked"]) || Math.max(0, totalIncomeAud - frankedAmountAud);
    const code = instrumentCode(transaction);
    const name = transaction.description || `${transaction.symbol} dividend`;
    const comments = incomeComment(transaction);
    const isForeign = localCurrency !== "AUD" || !["ASX", "AU"].includes(transaction.exchange.toUpperCase());

    if (isForeign) {
      sections.foreign.push({
        code,
        name,
        paidDate: transaction.tradeDate,
        exchangeRate: rawAmount(transaction, ["exchangeRate"]) || transaction.fxRateToBase || null,
        currency: localCurrency,
        netAmountAud,
        foreignTaxWithheldAud,
        grossAmountAud: totalIncomeAud,
        country: countryForIncome(transaction, localCurrency),
        incomeType: "Dividend",
        comments,
      });
      continue;
    }

    const row: EofyAustralianIncomeRow = {
      code,
      name,
      paidDate: transaction.tradeDate,
      totalIncomeAud,
      netAmountAud,
      frankedAmountAud,
      unfrankedAmountAud,
      interestAud: 0,
      taxDeferredAud: rawAmount(transaction, ["taxDeferredAud", "taxDeferred"]),
      amitCostBaseDecreaseAud: rawAmount(transaction, ["amitCostBaseDecreaseAud", "amitCostBaseDecrease"]),
      amitCostBaseIncreaseAud: rawAmount(transaction, ["amitCostBaseIncreaseAud", "amitCostBaseIncrease"]),
      foreignSourceIncomeAud: rawAmount(transaction, ["foreignSourceIncomeAud", "foreignSourceIncome"]),
      discountedCapitalGainsAud: rawAmount(transaction, ["discountedCapitalGainsAud", "discountedCapitalGains"]),
      capitalGainsAud: rawAmount(transaction, ["capitalGainsAud", "capitalGains"]),
      cgtConcessionAud: rawAmount(transaction, ["cgtConcessionAud", "cgtConcession"]),
      nonAssessableAud: rawAmount(transaction, ["nonAssessableAud", "nonAssessable"]),
      tfnWithholdingAud: rawAmount(transaction, ["tfnWithholdingAud", "tfnWithholding", "tfnWt"]),
      foreignIncomeTaxAud: foreignTaxWithheldAud,
      frankingCreditsAud,
      otherNetForeignSourceIncomeAud: rawAmount(transaction, ["otherNetForeignSourceIncomeAud", "otherNetFsi"]),
      licCapitalGainAud: rawAmount(transaction, ["licCapitalGainAud", "licCapitalGain"]),
      grossDividendAud: totalIncomeAud + frankingCreditsAud,
      comments,
    };

    if (isTrustLikeIncome(transaction)) sections.australianTrust.push(row);
    else sections.australianNonTrust.push(row);
  }

  sections.australianNonTrust.sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.code.localeCompare(b.code));
  sections.australianTrust.sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.code.localeCompare(b.code));
  sections.foreign.sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.code.localeCompare(b.code));
  return sections;
}

export function incomeRows(transactions: StoredTransaction[], startDate: string, endDate: string) {
  const payments: EofyIncomePayment[] = [];
  const symbols = new Map<string, EofyIncomeSymbol>();

  for (const transaction of transactions) {
    if (transaction.type !== "DIVIDEND" || !dateInRange(transaction.tradeDate, startDate, endDate)) continue;
    const netIncomeAud = transactionAud(transaction.netCash, transaction);
    const taxWithheldAud = transactionAud(transaction.taxes, transaction);
    const feesAud = transactionAud(transaction.fees, transaction);
    const frankingCreditsAud = dividendFrankingCreditsAud(transaction);
    const grossIncomeAud = dividendGrossAud(transaction, netIncomeAud, taxWithheldAud, frankingCreditsAud);
    const symbol = transaction.symbol || "Income";
    const name = transaction.description || `${symbol} dividend`;
    const payment = {
      id: transaction.id,
      symbol,
      name,
      broker: transaction.broker,
      paymentDate: transaction.tradeDate,
      exDate: dividendExDate(transaction),
      currency: transaction.currency,
      grossIncomeAud,
      netIncomeAud,
      frankingCreditsAud,
      taxWithheldAud,
      feesAud,
      units: dividendUnits(transaction),
      source: transaction.source,
    };
    const row = symbols.get(symbol) ?? {
      symbol,
      name,
      payments: 0,
      grossIncomeAud: 0,
      netIncomeAud: 0,
      frankingCreditsAud: 0,
      taxWithheldAud: 0,
      feesAud: 0,
    };

    row.payments += 1;
    row.grossIncomeAud += grossIncomeAud;
    row.netIncomeAud += netIncomeAud;
    row.frankingCreditsAud += frankingCreditsAud;
    row.taxWithheldAud += taxWithheldAud;
    row.feesAud += feesAud;
    symbols.set(symbol, row);
    payments.push(payment);
  }

  return {
    payments: payments.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.symbol.localeCompare(b.symbol)),
    symbols: [...symbols.values()].sort((a, b) => b.grossIncomeAud - a.grossIncomeAud),
  };
}
