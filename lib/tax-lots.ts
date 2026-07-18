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

function discountRate(ownerType: OwnerType) {
  return ownerType === "SMSF" ? 1 / 3 : 0.5;
}

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

function taxableGain(gainAud: number, eligible: boolean, rate: number) {
  if (gainAud <= 0) return gainAud;
  return eligible ? gainAud * (1 - rate) : gainAud;
}

function audAmount(value: number | null | undefined, fxRateToBase: number | null | undefined) {
  return (value ?? 0) * (fxRateToBase || 1);
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

function makeRealisedLot(input: Omit<RealisedTaxLot, "taxableGainAud" | "discountEligible" | "discountRate" | "heldDays" | "ownerLabel">) {
  const heldDays = dateDiffDays(input.acquisitionDate, input.saleDate);
  const discount = discountRate(input.ownerType);
  const eligible = isDiscountEligible(heldDays);
  return {
    ...input,
    ownerLabel: ownerLabel(input.ownerType),
    heldDays,
    discountEligible: eligible,
    discountRate: discount,
    taxableGainAud: taxableGain(input.realisedGainAud, eligible, discount),
  };
}

function buildWorkingLots(transactions: StoredTransaction[]) {
  const lots = new Map<string, WorkingLot[]>();
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
      }));
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
      }));
    }
  }

  return { lots, realised };
}

function openLotsForHolding(holding: DashboardHolding, lots: WorkingLot[], asOfDate: string): OpenTaxLot[] {
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
      taxableGainIfSoldAud: taxableGain(gainAud, eligible, rate),
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
    output.push({
      id: `${holding.id}:fallback`,
      ownerType: holding.ownerType,
      ownerLabel: ownerLabel(holding.ownerType),
      broker: holding.broker,
      accountKey: maskAccount(holding.accountKey),
      symbol: holding.symbol,
      name: holding.name,
      exchange: holding.exchange,
      acquisitionDate: null,
      asOfDate,
      heldDays: null,
      discountEligible: false,
      discountRate: rate,
      quantity: missingQuantity,
      costAud: fallbackCostAud,
      marketValueAud,
      unrealisedGainAud: gainAud,
      unrealisedGainPercent: fallbackCostAud ? (gainAud / fallbackCostAud) * 100 : 0,
      taxableGainIfSoldAud: taxableGain(gainAud, false, rate),
      source: "position_fallback",
      note: "Trade history incomplete; using current position cost basis.",
    });
  }

  return output;
}

export function buildTaxLots(data: DashboardData, transactions: StoredTransaction[], generatedAt = new Date()): TaxLotsResponse {
  const asOfDate = (data.lastUpdated ?? generatedAt.toISOString()).slice(0, 10);
  const { lots, realised } = buildWorkingLots(transactions);
  const openLots = data.holdings
    .filter(isTaxableHolding)
    .flatMap((holding) => openLotsForHolding(holding, lots.get(holdingKey(holding)) ?? [], asOfDate))
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
