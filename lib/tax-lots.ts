import type { DashboardData, DashboardHolding, OwnerType, Scope, StoredTransaction } from "@/lib/storage";

export type OpenTaxLot = {
  id: string;
  ownerType: OwnerType;
  ownerLabel: string;
  broker: string;
  accountKey: string;
  symbol: string;
  name: string;
  exchange: string;
  acquisitionDate: string | null;
  asOfDate: string;
  heldDays: number | null;
  discountEligible: boolean;
  discountRate: number;
  quantity: number;
  costAud: number;
  marketValueAud: number;
  unrealisedGainAud: number;
  unrealisedGainPercent: number;
  taxableGainIfSoldAud: number;
  source: "transaction_fifo" | "position_fallback";
  note: string;
};

export type RealisedTaxLot = {
  id: string;
  ownerType: OwnerType;
  ownerLabel: string;
  broker: string;
  accountKey: string;
  symbol: string;
  name: string;
  exchange: string;
  acquisitionDate: string | null;
  saleDate: string;
  heldDays: number | null;
  discountEligible: boolean;
  discountRate: number;
  quantity: number;
  proceedsAud: number;
  costAud: number;
  realisedGainAud: number;
  taxableGainAud: number;
  note: string;
};

export type TaxLotsResponse = {
  scope: Scope;
  asOfDate: string;
  generatedAt: string;
  summary: {
    openLots: number;
    realisedLots: number;
    openCostAud: number;
    openMarketValueAud: number;
    unrealisedGainAud: number;
    unrealisedDiscountEligibleGainAud: number;
    taxableGainIfSoldAud: number;
    realisedGainAud: number;
    realisedLossAud: number;
    netRealisedAud: number;
    taxableRealisedAud: number;
    fallbackLots: number;
  };
  openLots: OpenTaxLot[];
  realisedLots: RealisedTaxLot[];
};

type WorkingLot = {
  id: string;
  ownerType: OwnerType;
  ownerLabel: string;
  broker: string;
  accountKey: string;
  symbol: string;
  name: string;
  exchange: string;
  acquisitionDate: string | null;
  remainingQuantity: number;
  costPerUnitAud: number;
  source: "transaction_fifo" | "position_fallback";
  note: string;
};

const tolerance = 0.000001;

function ownerLabel(ownerType: OwnerType) {
  return ownerType === "SMSF" ? "SMSF" : "Personal";
}

/**
 * The CGT discount rate for a book in accumulation phase: a third for a complying fund, a half for
 * an individual. A fund in pension phase never reaches this — its gains are exempt outright, and a
 * discount on an exempt gain is meaningless.
 */
function discountRate(ownerType: OwnerType) {
  return ownerType === "SMSF" ? 1 / 3 : 0.5;
}

export type TaxTreatment = {
  /** True where the book is wholly in pension phase, making capital gains exempt. */
  pensionPhase: boolean;
};

const ACCUMULATION: TaxTreatment = { pensionPhase: false };

function maskAccount(account: string) {
  if (!account) return "";
  return account.length <= 4 ? account : `${account.slice(0, 2)}....${account.slice(-3)}`;
}

function dateDiffDays(start: string | null, end: string) {
  if (!start) return null;
  const startTime = new Date(`${start}T12:00:00Z`).getTime();
  const endTime = new Date(`${end}T12:00:00Z`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  return Math.floor((endTime - startTime) / 86_400_000);
}

function isDiscountEligible(heldDays: number | null) {
  return heldDays != null && heldDays >= 365;
}

/**
 * What would actually be taxed on a disposal today.
 *
 * A gain in a pension-phase book is exempt current pension income, so the answer is nothing at all
 * — not the gain less a discount. Reporting it as fully taxable, which is what happens without a
 * tax treatment, makes trimming a winner in the fund look expensive when it is free.
 */
function taxableGain(gainAud: number, eligible: boolean, rate: number, treatment: TaxTreatment) {
  if (treatment.pensionPhase) return 0;
  if (gainAud <= 0) return gainAud;
  return eligible ? gainAud * (1 - rate) : gainAud;
}

function audAmount(value: number | null | undefined, fxRateToBase: number | null | undefined) {
  return (value ?? 0) * (fxRateToBase || 1);
}

/**
 * The same identity without the account.
 *
 * A trade file need not name the account it came from: the Directshares All Trades Report is
 * titled with a person, and its holdings export takes the account from a column the trades export
 * does not have. When those two disagree the account-qualified key misses, every lot falls back to
 * cost basis, and the positions read as undated even though their trades are sitting in storage.
 */
function brokerKey(input: { ownerType: string; broker: string; symbol: string; exchange: string }) {
  // Ticker and venue, not the instrument key: the key is not written the same way on both sides.
  // Postgres stores a Directshares position as "ASL:ASX" while an imported trade carries
  // "Directshares:ASL:ASX", so keying on it reproduces the very mismatch this exists to survive.
  return [
    input.ownerType,
    input.broker,
    `${input.symbol}:${input.exchange}`.toUpperCase(),
  ].join("|");
}

function holdingKey(input: Pick<DashboardHolding, "ownerType" | "broker" | "accountKey" | "instrumentKey" | "symbol" | "exchange">) {
  return [
    input.ownerType,
    input.broker,
    input.accountKey,
    input.instrumentKey || `${input.symbol}:${input.exchange}`,
  ].join("|");
}

function transactionKey(transaction: StoredTransaction) {
  return [
    transaction.ownerType,
    transaction.broker,
    transaction.accountKey,
    transaction.instrumentKey || `${transaction.symbol}:${transaction.exchange}`,
  ].join("|");
}

function isTaxableHolding(holding: DashboardHolding) {
  if (Math.abs(holding.quantity) <= tolerance) return false;
  return holding.assetClass !== "Cash" && holding.symbol.toUpperCase() !== "CASH";
}

function buyCostAud(transaction: StoredTransaction) {
  return Math.abs(audAmount(transaction.cost, transaction.fxRateToBase)) + (transaction.fees ?? 0) + (transaction.taxes ?? 0);
}

function sellProceedsAud(transaction: StoredTransaction) {
  if (transaction.netCash != null) return Math.abs(audAmount(transaction.netCash, transaction.fxRateToBase));
  return Math.max(0, Math.abs(audAmount(transaction.cost, transaction.fxRateToBase)) - (transaction.fees ?? 0) - (transaction.taxes ?? 0));
}

function makeRealisedLot(input: Omit<RealisedTaxLot, "taxableGainAud" | "discountEligible" | "discountRate" | "heldDays" | "ownerLabel">, treatment: TaxTreatment) {
  const heldDays = dateDiffDays(input.acquisitionDate, input.saleDate);
  const discount = discountRate(input.ownerType);
  const eligible = isDiscountEligible(heldDays);
  return {
    ...input,
    ownerLabel: ownerLabel(input.ownerType),
    heldDays,
    discountEligible: eligible,
    discountRate: discount,
    taxableGainAud: taxableGain(input.realisedGainAud, eligible, discount, treatment),
  };
}

function buildWorkingLots(transactions: StoredTransaction[], treatment: TaxTreatment) {
  const lots = new Map<string, WorkingLot[]>();
  // Second index on the same lot objects, so a fallback lookup shares their consumed quantities.
  const byBroker = new Map<string, WorkingLot[]>();
  const realised: RealisedTaxLot[] = [];
  const sorted = [...transactions]
    .filter((transaction) => transaction.type === "BUY" || transaction.type === "SELL")
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.externalId.localeCompare(b.externalId));

  for (const transaction of sorted) {
    const key = transactionKey(transaction);
    const quantity = Math.abs(transaction.quantity ?? 0);
    if (quantity <= tolerance) continue;
    const lotRows = lots.get(key) ?? [];

    if (transaction.type === "BUY") {
      const costAud = buyCostAud(transaction);
      lotRows.push({
        id: transaction.id,
        ownerType: transaction.ownerType,
        ownerLabel: ownerLabel(transaction.ownerType),
        broker: transaction.broker,
        accountKey: maskAccount(transaction.accountKey),
        symbol: transaction.symbol,
        name: transaction.description || transaction.symbol,
        exchange: transaction.exchange,
        acquisitionDate: transaction.tradeDate,
        remainingQuantity: quantity,
        costPerUnitAud: quantity ? costAud / quantity : 0,
        source: "transaction_fifo",
        note: "Matched from imported BUY transaction.",
      });
      lots.set(key, lotRows);
      const brokerRows = byBroker.get(brokerKey(transaction)) ?? [];
      brokerRows.push(lotRows[lotRows.length - 1]);
      byBroker.set(brokerKey(transaction), brokerRows);
      continue;
    }

    let remainingSaleQuantity = quantity;
    const proceedsAud = sellProceedsAud(transaction);
    const proceedsPerUnitAud = quantity ? proceedsAud / quantity : 0;

    for (const lot of lotRows) {
      if (remainingSaleQuantity <= tolerance) break;
      if (lot.remainingQuantity <= tolerance) continue;
      const matchedQuantity = Math.min(lot.remainingQuantity, remainingSaleQuantity);
      const costAud = lot.costPerUnitAud * matchedQuantity;
      const matchedProceedsAud = proceedsPerUnitAud * matchedQuantity;
      realised.push(makeRealisedLot({
        id: `${transaction.id}:${lot.id}:${matchedQuantity}`,
        ownerType: transaction.ownerType,
        broker: transaction.broker,
        accountKey: maskAccount(transaction.accountKey),
        symbol: transaction.symbol,
        name: transaction.description || lot.name || transaction.symbol,
        exchange: transaction.exchange,
        acquisitionDate: lot.acquisitionDate,
        saleDate: transaction.tradeDate,
        quantity: matchedQuantity,
        proceedsAud: matchedProceedsAud,
        costAud,
        realisedGainAud: matchedProceedsAud - costAud,
        note: "FIFO match from imported transactions.",
      }, treatment));
      lot.remainingQuantity -= matchedQuantity;
      remainingSaleQuantity -= matchedQuantity;
    }

    if (remainingSaleQuantity > tolerance) {
      const unmatchedProceedsAud = proceedsPerUnitAud * remainingSaleQuantity;
      const brokerRealisedAud = audAmount(transaction.realisedPnl, transaction.fxRateToBase);
      const estimatedGainAud = brokerRealisedAud || 0;
      realised.push(makeRealisedLot({
        id: `${transaction.id}:unmatched`,
        ownerType: transaction.ownerType,
        broker: transaction.broker,
        accountKey: maskAccount(transaction.accountKey),
        symbol: transaction.symbol,
        name: transaction.description || transaction.symbol,
        exchange: transaction.exchange,
        acquisitionDate: null,
        saleDate: transaction.tradeDate,
        quantity: remainingSaleQuantity,
        proceedsAud: unmatchedProceedsAud,
        costAud: Math.max(0, unmatchedProceedsAud - estimatedGainAud),
        realisedGainAud: estimatedGainAud,
        note: transaction.realisedPnl != null ? "Acquisition lot missing; using broker realised P/L." : "Acquisition lot missing; realised gain cannot be reconstructed.",
      }, treatment));
    }
  }

  return { lots, byBroker, realised };
}

function openLotsForHolding(holding: DashboardHolding, lots: WorkingLot[], asOfDate: string, treatment: TaxTreatment): OpenTaxLot[] {
  const currentQuantity = Math.abs(holding.quantity);
  if (currentQuantity <= tolerance) return [];
  const positiveLots = lots.filter((lot) => lot.remainingQuantity > tolerance);
  const lotQuantity = positiveLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
  const scale = lotQuantity > currentQuantity && lotQuantity > tolerance ? currentQuantity / lotQuantity : 1;
  const output: OpenTaxLot[] = [];
  let representedQuantity = 0;
  let representedCostAud = 0;

  for (const lot of positiveLots) {
    const quantity = lot.remainingQuantity * scale;
    if (quantity <= tolerance) continue;
    representedQuantity += quantity;
    const costAud = lot.costPerUnitAud * quantity;
    representedCostAud += costAud;
    const marketValueAud = holding.marketValueAud * (quantity / currentQuantity);
    const gainAud = marketValueAud - costAud;
    const heldDays = dateDiffDays(lot.acquisitionDate, asOfDate);
    const eligible = isDiscountEligible(heldDays);
    const rate = discountRate(holding.ownerType);
    output.push({
      id: `${holding.id}:${lot.id}`,
      ownerType: holding.ownerType,
      ownerLabel: ownerLabel(holding.ownerType),
      broker: holding.broker,
      accountKey: maskAccount(holding.accountKey),
      symbol: holding.symbol,
      name: holding.name,
      exchange: holding.exchange,
      acquisitionDate: lot.acquisitionDate,
      asOfDate,
      heldDays,
      discountEligible: eligible,
      discountRate: rate,
      quantity,
      costAud,
      marketValueAud,
      unrealisedGainAud: gainAud,
      unrealisedGainPercent: costAud ? (gainAud / costAud) * 100 : 0,
      taxableGainIfSoldAud: taxableGain(gainAud, eligible, rate, treatment),
      source: lot.source,
      note: scale < 1 ? "Imported transaction lots scaled to current position quantity." : lot.note,
    });
  }

  const missingQuantity = Math.max(0, currentQuantity - representedQuantity);
  if (missingQuantity > tolerance) {
    const fallbackCostAud = Math.max(0, holding.costAud - representedCostAud) || holding.averageCostAud * missingQuantity;
    const marketValueAud = holding.marketValueAud * (missingQuantity / currentQuantity);
    const gainAud = marketValueAud - fallbackCostAud;
    const rate = discountRate(holding.ownerType);
    /*
     * A fallback parcel normally has no date, because it exists precisely where trade history is
     * missing. Physical metal is the exception: it is bought on an invoice rather than a contract
     * note, so its purchase date sits on the asset record and reaches here on the position. Without
     * this the platinum parcel defaulted to no discount, overstating its taxable gain by half.
     */
    const fallbackAcquisitionDate = holding.acquisitionDate || null;
    const fallbackHeldDays = dateDiffDays(fallbackAcquisitionDate, asOfDate);
    const fallbackEligible = isDiscountEligible(fallbackHeldDays);
    output.push({
      id: `${holding.id}:fallback`,
      ownerType: holding.ownerType,
      ownerLabel: ownerLabel(holding.ownerType),
      broker: holding.broker,
      accountKey: maskAccount(holding.accountKey),
      symbol: holding.symbol,
      name: holding.name,
      exchange: holding.exchange,
      acquisitionDate: fallbackAcquisitionDate,
      asOfDate,
      heldDays: fallbackHeldDays,
      discountEligible: fallbackEligible,
      discountRate: rate,
      quantity: missingQuantity,
      costAud: fallbackCostAud,
      marketValueAud,
      unrealisedGainAud: gainAud,
      unrealisedGainPercent: fallbackCostAud ? (gainAud / fallbackCostAud) * 100 : 0,
      taxableGainIfSoldAud: taxableGain(gainAud, fallbackEligible, rate, treatment),
      source: "position_fallback",
      note: holding.acquisitionDate
        ? "No trade history; dated from the asset record and valued at current position cost basis."
        : "Trade history incomplete; using current position cost basis.",
    });
  }

  return output;
}

export function buildTaxLots(data: DashboardData, transactions: StoredTransaction[], generatedAt = new Date(), treatment: TaxTreatment = ACCUMULATION): TaxLotsResponse {
  const asOfDate = (data.lastUpdated ?? generatedAt.toISOString()).slice(0, 10);
  const { lots, byBroker, realised } = buildWorkingLots(transactions, treatment);
  const openLots = data.holdings
    .filter(isTaxableHolding)
    .flatMap((holding) => openLotsForHolding(
      holding,
      lots.get(holdingKey(holding)) ?? byBroker.get(brokerKey(holding)) ?? [],
      asOfDate,
      treatment,
    ))
    .sort((a, b) => b.unrealisedGainAud - a.unrealisedGainAud);
  const realisedLots = realised.sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  const realisedGainAud = realisedLots.reduce((sum, lot) => lot.realisedGainAud > 0 ? sum + lot.realisedGainAud : sum, 0);
  const realisedLossAud = realisedLots.reduce((sum, lot) => lot.realisedGainAud < 0 ? sum + Math.abs(lot.realisedGainAud) : sum, 0);

  return {
    scope: data.scope,
    asOfDate,
    generatedAt: generatedAt.toISOString(),
    summary: {
      openLots: openLots.length,
      realisedLots: realisedLots.length,
      openCostAud: openLots.reduce((sum, lot) => sum + lot.costAud, 0),
      openMarketValueAud: openLots.reduce((sum, lot) => sum + lot.marketValueAud, 0),
      unrealisedGainAud: openLots.reduce((sum, lot) => sum + lot.unrealisedGainAud, 0),
      unrealisedDiscountEligibleGainAud: openLots.reduce((sum, lot) => lot.discountEligible && lot.unrealisedGainAud > 0 ? sum + lot.unrealisedGainAud : sum, 0),
      taxableGainIfSoldAud: openLots.reduce((sum, lot) => sum + lot.taxableGainIfSoldAud, 0),
      realisedGainAud,
      realisedLossAud,
      netRealisedAud: realisedGainAud - realisedLossAud,
      taxableRealisedAud: realisedLots.reduce((sum, lot) => sum + lot.taxableGainAud, 0),
      fallbackLots: openLots.filter((lot) => lot.source === "position_fallback").length,
    },
    openLots,
    realisedLots,
  };
}
