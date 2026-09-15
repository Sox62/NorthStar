import { buildCapitalPolicySummary, type CapitalPolicySummary } from "@/lib/capital-policy";
import { ownerForScope } from "@/lib/core/accounting";
import type {
  DashboardData,
  OrderPurpose,
  OwnerType,
  PositionRiskPlan,
  PriceBook,
  RiskExceptionCode,
  RiskSnapshot,
  Scope,
  StopType,
  StorageAdapter,
  StoredDailyPrice,
  StoredOpenOrder,
  StoredPosition,
} from "@/lib/storage";
import { SECTOR_COLORS, type Sector } from "@/southernstar/types";

export const RISK_CALCULATION_VERSION = "stops-orders-v1";

const inactiveOrderStatuses = new Set(["cancelled", "canceled", "filled", "inactive", "completed", "stopped", "rejected"]);
const STALE_ORDER_DAYS = 3;

const sectorBenchmarkDefaults: Partial<Record<Sector, string>> = {
  "Gold miners": "GDX",
  "Silver miners": "SILJ",
  "Uranium miners": "URNM",
  "Uranium explorers": "URNM",
  "Copper miners": "COPX",
  Coal: "XME",
  Oil: "XOP",
  "Soft commodities": "DBA",
  Technology: "QQQ",
  "Broad equities": "SPY",
};

const sectorNames = new Set<string>(Object.keys(SECTOR_COLORS));

function recordedSectorForPosition(position: Pick<StoredPosition, "assetClass">): Sector {
  const recorded = position.assetClass.trim();
  return sectorNames.has(recorded) ? recorded as Sector : "Broad equities";
}

export type BrokerOrderPurpose = OrderPurpose | "UNCLASSIFIED";
export type RelativeStrengthStatus = "OUTPERFORMING" | "IMPROVING" | "NEUTRAL" | "UNDERPERFORMING" | "NO_BENCHMARK";

export type RiskException = {
  code: RiskExceptionCode;
  severity: "warning" | "critical";
  message: string;
};

export type SectorRelativeStrength = {
  benchmarkSymbol: string | null;
  status: RelativeStrengthStatus;
  relativeReturnPercent: number | null;
  stockReturnPercent: number | null;
  benchmarkReturnPercent: number | null;
  observationDays: number | null;
};

export type BrokerStopState = {
  status: "NONE" | "PLAN_ONLY" | "PROTECTED" | "CHECK_BROKER" | "UNDER_STOPPED" | "OVER_STOPPED" | "STALE";
  activeStopCount: number;
  brokerStopPrice: number | null;
  brokerStopQuantity: number;
  brokerStopAsOfDate: string | null;
  matchedOrderIds: string[];
};

export type StopRiskRow = {
  positionId: string;
  ownerType: OwnerType;
  broker: string;
  accountKey: string;
  instrumentKey: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  sector: Sector;
  quantity: number;
  averageCostAud: number;
  currentPrice: number | null;
  currentPriceAud: number | null;
  marketValueAud: number;
  stopType: StopType | null;
  plannedStopPrice: number | null;
  plannedStopPriceAud: number | null;
  plannedTargetPrice: number | null;
  riskFromEntryAud: number | null;
  riskFromCurrentAud: number | null;
  riskPercentNav: number | null;
  riskPercentPosition: number | null;
  targetRewardAud: number | null;
  rewardRiskRatio: number | null;
  rationale: string | null;
  invalidationNotes: string | null;
  reviewStatus: string | null;
  sectorRelativeStrength: SectorRelativeStrength;
  brokerStop: BrokerStopState;
  exceptions: RiskException[];
  updatedAt: string | null;
};

export type EntryOrderRisk = {
  orderId: string;
  ownerType: OwnerType;
  broker: string;
  accountKey: string;
  symbol: string;
  name: string;
  currency: string;
  side: string;
  status: string;
  orderType: string;
  remainingQuantity: number;
  commitmentPrice: number | null;
  fxRateToAud: number | null;
  estimatedCapitalAud: number | null;
  asOfDate: string;
  purpose: BrokerOrderPurpose;
  classification: string;
};

export type BrokerOrderReview = {
  orderId: string;
  ownerType: OwnerType;
  accountKey: string;
  symbol: string;
  side: string;
  status: string;
  orderType: string;
  stopPrice: number | null;
  limitPrice: number | null;
  remainingQuantity: number;
  purpose: BrokerOrderPurpose;
  classification: string;
  asOfDate: string;
};

export type RiskGroupSummary = {
  key: string;
  label: string;
  marketValueAud: number;
  riskAud: number;
  riskPercentNav: number;
  positions: number;
  positionsWithStops: number;
  exceptions: number;
};

export type StopsRiskSummary = {
  scope: Scope;
  navAud: number;
  investedCapitalAud: number;
  cashAud: number;
  deployableCashAud: number;
  pendingOrderCapitalAud: number;
  pendingOrderCapitalMissingFx: number;
  totalStopRiskAud: number;
  totalStopRiskPercentNav: number;
  positions: number;
  positionsWithStops: number;
  positionsWithoutStops: number;
  largestSinglePositionRiskAud: number;
  largestSinglePositionRiskSymbol: string | null;
  largestSectorRiskAud: number;
  largestSectorRiskLabel: string | null;
  criticalExceptions: number;
  warningExceptions: number;
  unclassifiedBrokerOrders: number;
  calculationVersion: string;
  capturedAt: string;
};

export type StopsRiskDashboard = {
  summary: StopsRiskSummary;
  rows: StopRiskRow[];
  entryOrders: EntryOrderRisk[];
  brokerOrders: BrokerOrderReview[];
  sectors: RiskGroupSummary[];
  accounts: RiskGroupSummary[];
  capitalByOwner: Partial<Record<OwnerType, CapitalPolicySummary>>;
  history: RiskSnapshot[];
};

function upper(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function sameIdentity(left: { ownerType: OwnerType; broker: string; accountKey: string }, right: { ownerType: OwnerType; broker: string; accountKey: string }) {
  return left.ownerType === right.ownerType && upper(left.broker) === upper(right.broker) && left.accountKey === right.accountKey;
}

function positionPlanKey(position: Pick<StoredPosition, "ownerType" | "broker" | "accountKey" | "instrumentKey">) {
  return `${position.ownerType}::${upper(position.broker)}::${position.accountKey}::${position.instrumentKey}`;
}

function symbolPlanKey(position: Pick<StoredPosition, "ownerType" | "broker" | "accountKey" | "symbol" | "exchange">) {
  return `${position.ownerType}::${upper(position.broker)}::${position.accountKey}::${upper(position.symbol)}::${upper(position.exchange)}`;
}

function orderPositionKey(order: Pick<StoredOpenOrder, "ownerType" | "broker" | "accountKey" | "symbol">) {
  return `${order.ownerType}::${upper(order.broker)}::${order.accountKey}::${upper(order.symbol)}`;
}

function isActiveOrder(order: StoredOpenOrder) {
  return !inactiveOrderStatuses.has(upper(order.status).toLowerCase());
}

function remainingQuantity(order: StoredOpenOrder) {
  if (order.remainingQuantity != null) return Math.max(0, order.remainingQuantity);
  const total = order.totalQuantity ?? 0;
  const filled = order.filledQuantity ?? 0;
  return Math.max(0, total - filled);
}

function orderPurpose(order: StoredOpenOrder): BrokerOrderPurpose {
  const side = upper(order.side);
  const type = upper(order.orderType);
  if (side.startsWith("BUY")) return "ENTRY";
  if (side.startsWith("SELL") && order.stopPrice != null) return "PROTECTIVE_STOP";
  if (side.startsWith("SELL") && order.limitPrice != null && (type.includes("LMT") || type.includes("LIMIT"))) return "PROFIT_TARGET";
  return "UNCLASSIFIED";
}

function commitmentPrice(order: StoredOpenOrder) {
  return order.limitPrice ?? order.stopPrice ?? order.averagePrice ?? null;
}

function daysBetween(left: string, right: string) {
  const start = new Date(left).getTime();
  const end = new Date(right).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.floor(Math.abs(end - start) / 86_400_000);
}

function latestFxRate(book: PriceBook, currency: string, asOfDate?: string | null) {
  if (upper(currency) === "AUD") return 1;
  const rates = book.fxRates
    .filter((rate) => upper(rate.currency) === upper(currency) && (!asOfDate || rate.rateDate <= asOfDate))
    .sort((left, right) => right.rateDate.localeCompare(left.rateDate) || right.retrievedAt.localeCompare(left.retrievedAt));
  return rates[0]?.rateToAud ?? null;
}

function positionFxRate(position: StoredPosition, book: PriceBook) {
  if (upper(position.currency) === "AUD") return 1;
  if (position.quantity && position.lastPrice && position.marketValueAud) {
    const inferred = position.marketValueAud / (position.quantity * position.lastPrice);
    if (Number.isFinite(inferred) && inferred > 0) return inferred;
  }
  const marketRate = latestFxRate(book, position.currency, position.asOfDate);
  if (marketRate) return marketRate;
  if (position.quantity && position.lastPrice && position.costAud) {
    const fallback = position.costAud / (position.quantity * position.lastPrice);
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
  }
  return null;
}

function groupPricesBySymbol(book: PriceBook) {
  const grouped = new Map<string, StoredDailyPrice[]>();
  for (const price of book.prices) {
    const key = upper(price.symbol);
    const current = grouped.get(key) ?? [];
    current.push(price);
    grouped.set(key, current);
  }
  for (const [key, prices] of grouped) {
    grouped.set(key, prices.sort((left, right) => left.priceDate.localeCompare(right.priceDate) || left.retrievedAt.localeCompare(right.retrievedAt)));
  }
  return grouped;
}

function seriesReturn(series: StoredDailyPrice[], windowDays = 90) {
  if (series.length < 2) return null;
  const latest = series[series.length - 1]!;
  const latestTime = new Date(latest.priceDate).getTime();
  const cutoff = Number.isFinite(latestTime) ? new Date(latestTime - windowDays * 86_400_000).toISOString().slice(0, 10) : "";
  const eligible = cutoff ? series.filter((price) => price.priceDate >= cutoff) : series;
  const window = eligible.length >= 2 ? eligible : series;
  const first = window[0]!;
  if (!first.close || !latest.close) return null;
  return {
    returnPercent: (latest.close / first.close - 1) * 100,
    observationDays: Math.max(1, daysBetween(first.priceDate, latest.priceDate) ?? windowDays),
  };
}

function relativeStrength(
  position: StoredPosition,
  plan: PositionRiskPlan | null,
  sector: Sector,
  pricesBySymbol: Map<string, StoredDailyPrice[]>,
): SectorRelativeStrength {
  const benchmarkSymbol = upper(plan?.sectorBenchmarkSymbol) || sectorBenchmarkDefaults[sector] || null;
  if (!benchmarkSymbol) {
    return { benchmarkSymbol: null, status: "NO_BENCHMARK", relativeReturnPercent: null, stockReturnPercent: null, benchmarkReturnPercent: null, observationDays: null };
  }
  const stock = seriesReturn(pricesBySymbol.get(upper(position.symbol)) ?? []);
  const benchmark = seriesReturn(pricesBySymbol.get(benchmarkSymbol) ?? []);
  if (!stock || !benchmark) {
    return { benchmarkSymbol, status: "NO_BENCHMARK", relativeReturnPercent: null, stockReturnPercent: stock?.returnPercent ?? null, benchmarkReturnPercent: benchmark?.returnPercent ?? null, observationDays: stock?.observationDays ?? benchmark?.observationDays ?? null };
  }
  const relativeReturnPercent = stock.returnPercent - benchmark.returnPercent;
  const status: RelativeStrengthStatus =
    relativeReturnPercent >= 5 ? "OUTPERFORMING"
      : relativeReturnPercent >= 1 ? "IMPROVING"
        : relativeReturnPercent <= -5 ? "UNDERPERFORMING"
          : "NEUTRAL";
  return {
    benchmarkSymbol,
    status,
    relativeReturnPercent,
    stockReturnPercent: stock.returnPercent,
    benchmarkReturnPercent: benchmark.returnPercent,
    observationDays: Math.min(stock.observationDays, benchmark.observationDays),
  };
}

function mapPlans(plans: PositionRiskPlan[]) {
  const byPosition = new Map<string, PositionRiskPlan>();
  const byInstrument = new Map<string, PositionRiskPlan>();
  const bySymbol = new Map<string, PositionRiskPlan>();
  for (const plan of plans) {
    if (plan.positionId) byPosition.set(plan.positionId, plan);
    byInstrument.set(positionPlanKey(plan), plan);
    bySymbol.set(symbolPlanKey(plan), plan);
  }
  return { byPosition, byInstrument, bySymbol };
}

function findPlan(position: StoredPosition, plans: ReturnType<typeof mapPlans>) {
  return plans.byPosition.get(position.id) ?? plans.byInstrument.get(positionPlanKey(position)) ?? plans.bySymbol.get(symbolPlanKey(position)) ?? null;
}

function matchStopsForPosition(position: StoredPosition, orders: StoredOpenOrder[]) {
  return orders.filter((order) =>
    isActiveOrder(order)
    && orderPurpose(order) === "PROTECTIVE_STOP"
    && sameIdentity(position, order)
    && upper(order.symbol) === upper(position.symbol)
  );
}

function brokerStopState(position: StoredPosition, plan: PositionRiskPlan | null, stops: StoredOpenOrder[], capturedAt: string): BrokerStopState {
  if (!stops.length) {
    return {
      status: plan?.plannedStopPrice == null ? "NONE" : "PLAN_ONLY",
      activeStopCount: 0,
      brokerStopPrice: null,
      brokerStopQuantity: 0,
      brokerStopAsOfDate: null,
      matchedOrderIds: [],
    };
  }
  const quantity = stops.reduce((sum, order) => sum + remainingQuantity(order), 0);
  const bestStop = stops
    .map((order) => order.stopPrice)
    .filter((price): price is number => price != null)
    .sort((left, right) => right - left)[0] ?? null;
  const asOfDate = stops.map((order) => order.asOfDate).sort()[0] ?? null;
  const stale = Boolean(asOfDate && (daysBetween(asOfDate, capturedAt) ?? 0) > STALE_ORDER_DAYS);
  const quantityGap = quantity - Math.abs(position.quantity);
  const stopDiff = plan?.plannedStopPrice != null && bestStop != null ? Math.abs(bestStop - plan.plannedStopPrice) : 0;
  const materialStopDiff = plan?.plannedStopPrice != null && bestStop != null && (stopDiff > 0.01 && stopDiff / plan.plannedStopPrice > 0.01);
  const status: BrokerStopState["status"] =
    stale ? "STALE"
      : quantityGap < -0.5 ? "UNDER_STOPPED"
        : quantityGap > 0.5 ? "OVER_STOPPED"
          : materialStopDiff ? "CHECK_BROKER"
            : "PROTECTED";
  return {
    status,
    activeStopCount: stops.length,
    brokerStopPrice: bestStop,
    brokerStopQuantity: quantity,
    brokerStopAsOfDate: asOfDate,
    matchedOrderIds: stops.map((order) => order.orderId),
  };
}

function rowExceptions(input: {
  position: StoredPosition;
  plan: PositionRiskPlan | null;
  brokerStop: BrokerStopState;
  relativeStrength: SectorRelativeStrength;
  plannedStopPrice: number | null;
  currentPrice: number | null;
  capturedAt: string;
}): RiskException[] {
  const exceptions: RiskException[] = [];
  if (input.plannedStopPrice == null) {
    exceptions.push({ code: "NO_STOP_RECORDED", severity: "critical", message: "No SouthernStar stop plan is recorded." });
  } else if (input.brokerStop.status === "PLAN_ONLY") {
    exceptions.push({ code: "BROKER_ORDER_MISMATCH", severity: "warning", message: "Stop plan exists but no active broker stop was found." });
  }
  if (input.brokerStop.status === "CHECK_BROKER") {
    exceptions.push({ code: "BROKER_ORDER_MISMATCH", severity: "warning", message: "Broker stop price differs from the SouthernStar plan." });
  }
  if (input.brokerStop.status === "UNDER_STOPPED") {
    exceptions.push({ code: "STOP_QUANTITY_LT_POSITION", severity: "warning", message: "Active broker stop quantity is below the position size." });
  }
  if (input.brokerStop.status === "OVER_STOPPED") {
    exceptions.push({ code: "STOP_QUANTITY_GT_POSITION", severity: "warning", message: "Active broker stop quantity is above the position size." });
  }
  if (input.brokerStop.status === "STALE") {
    exceptions.push({ code: "BROKER_ORDER_DATA_STALE", severity: "warning", message: `Broker stop data is older than ${STALE_ORDER_DAYS} days.` });
  }
  if (input.plannedStopPrice != null && input.currentPrice != null && input.currentPrice <= input.plannedStopPrice) {
    exceptions.push({ code: "PRICE_BELOW_RECORDED_STOP", severity: "critical", message: "Current price is at or below the recorded stop." });
  }
  if (input.relativeStrength.status === "UNDERPERFORMING") {
    exceptions.push({ code: "STOCK_UNDERPERFORMING_SECTOR_ETF", severity: "warning", message: "Position is underperforming its sector benchmark over the available window." });
  }
  return exceptions;
}

function buildBrokerOrderReviews(orders: StoredOpenOrder[]): BrokerOrderReview[] {
  return orders
    .filter(isActiveOrder)
    .map((order) => {
      const purpose = orderPurpose(order);
      return {
        orderId: order.orderId,
        ownerType: order.ownerType,
        accountKey: order.accountKey,
        symbol: order.symbol,
        side: order.side,
        status: order.status,
        orderType: order.orderType,
        stopPrice: order.stopPrice,
        limitPrice: order.limitPrice,
        remainingQuantity: remainingQuantity(order),
        purpose,
        classification: purpose === "UNCLASSIFIED" ? "Needs manual purpose review" : purpose.replaceAll("_", " ").toLowerCase(),
        asOfDate: order.asOfDate,
      };
    })
    .sort((left, right) => left.symbol.localeCompare(right.symbol) || left.ownerType.localeCompare(right.ownerType));
}

function buildEntryOrders(orders: StoredOpenOrder[], book: PriceBook): EntryOrderRisk[] {
  return orders
    .filter((order) => isActiveOrder(order) && orderPurpose(order) === "ENTRY")
    .map((order) => {
      const quantity = remainingQuantity(order);
      const price = commitmentPrice(order);
      const fxRateToAud = price == null ? null : latestFxRate(book, order.currency, order.asOfDate);
      const estimatedCapitalAud = price != null && fxRateToAud != null ? quantity * price * fxRateToAud : null;
      return {
        orderId: order.orderId,
        ownerType: order.ownerType,
        broker: order.broker,
        accountKey: order.accountKey,
        symbol: order.symbol,
        name: order.name,
        currency: order.currency,
        side: order.side,
        status: order.status,
        orderType: order.orderType,
        remainingQuantity: quantity,
        commitmentPrice: price,
        fxRateToAud,
        estimatedCapitalAud,
        asOfDate: order.asOfDate,
        purpose: "ENTRY" as const,
        classification: "pending entry capital",
      };
    })
    .sort((left, right) => (right.estimatedCapitalAud ?? 0) - (left.estimatedCapitalAud ?? 0));
}

function buildGroupSummaries(rows: StopRiskRow[], navAud: number, type: "sector" | "account"): RiskGroupSummary[] {
  const groups = new Map<string, RiskGroupSummary>();
  for (const row of rows) {
    const key = type === "sector" ? row.sector : `${row.ownerType}:${row.broker}:${row.accountKey}`;
    const label = type === "sector" ? row.sector : `${row.ownerType} · ${row.broker} · ${row.accountKey}`;
    const current = groups.get(key) ?? { key, label, marketValueAud: 0, riskAud: 0, riskPercentNav: 0, positions: 0, positionsWithStops: 0, exceptions: 0 };
    current.marketValueAud += row.marketValueAud;
    current.riskAud += row.riskFromCurrentAud ?? 0;
    current.positions += 1;
    if (row.plannedStopPrice != null) current.positionsWithStops += 1;
    current.exceptions += row.exceptions.length;
    groups.set(key, current);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, riskPercentNav: navAud ? group.riskAud / navAud * 100 : 0 }))
    .sort((left, right) => right.riskAud - left.riskAud || right.marketValueAud - left.marketValueAud);
}

async function dashboardsByScope(storage: StorageAdapter, scope: Scope) {
  const ownerScope = ownerForScope(scope);
  const [dashboard, personal, smsf] = await Promise.all([
    storage.dashboard(scope),
    ownerScope === "SMSF" ? Promise.resolve(null) : storage.dashboard("personal"),
    ownerScope === "PERSONAL" ? Promise.resolve(null) : storage.dashboard("smsf"),
  ]);
  return { dashboard, personal, smsf };
}

function capitalByOwnerFromDashboards(
  scope: Scope,
  dashboards: { dashboard: DashboardData; personal: DashboardData | null; smsf: DashboardData | null },
  orders: StoredOpenOrder[],
) {
  const capitalByOwner: Partial<Record<OwnerType, CapitalPolicySummary>> = {};
  if (scope === "personal") {
    capitalByOwner.PERSONAL = buildCapitalPolicySummary(dashboards.dashboard, orders);
  } else if (scope === "smsf") {
    capitalByOwner.SMSF = buildCapitalPolicySummary(dashboards.dashboard, orders);
  } else {
    if (dashboards.personal) capitalByOwner.PERSONAL = buildCapitalPolicySummary(dashboards.personal, orders);
    if (dashboards.smsf) capitalByOwner.SMSF = buildCapitalPolicySummary(dashboards.smsf, orders);
  }
  return capitalByOwner;
}

function isRiskPosition(position: StoredPosition) {
  if (upper(position.assetClass) === "CASH" || upper(position.symbol) === "CASH") return false;
  if (position.quantity <= 0) return false;
  return position.marketValueAud > 0 || position.costAud > 0;
}

export async function buildStopsRiskDashboard(storage: StorageAdapter, scope: Scope = "overall"): Promise<StopsRiskDashboard> {
  const capturedAt = new Date().toISOString();
  const ownerType = ownerForScope(scope);
  const [dashboards, orders, plans, book, history] = await Promise.all([
    dashboardsByScope(storage, scope),
    storage.listOpenOrders(ownerType),
    storage.listPositionRiskPlans(ownerType),
    storage.listPriceBook(20_000),
    storage.listRiskSnapshots(scope, 90),
  ]);
  const { dashboard } = dashboards;
  const plansByKey = mapPlans(plans);
  const pricesBySymbol = groupPricesBySymbol(book);
  const activeOrders = orders.filter(isActiveOrder);
  const orderReviews = buildBrokerOrderReviews(activeOrders);
  const entryOrders = buildEntryOrders(activeOrders, book);
  const capitalByOwner = capitalByOwnerFromDashboards(scope, dashboards, activeOrders);
  const positions = dashboard.holdings.filter(isRiskPosition);

  const rows = positions.map((position) => {
    const plan = findPlan(position, plansByKey);
    const fxRateToAud = positionFxRate(position, book);
    const currentPrice = position.lastPrice;
    const currentPriceAud = currentPrice != null && fxRateToAud != null ? currentPrice * fxRateToAud : null;
    const plannedStopPrice = plan?.plannedStopPrice ?? null;
    const plannedStopPriceAud = plannedStopPrice != null && fxRateToAud != null ? plannedStopPrice * fxRateToAud : null;
    const plannedTargetPrice = plan?.plannedTargetPrice ?? null;
    const quantity = Math.abs(position.quantity);
    const averageCostAud = position.averageCostAud;
    const riskFromEntryAud = plannedStopPriceAud != null ? Math.max(0, (averageCostAud - plannedStopPriceAud) * quantity) : null;
    const riskFromCurrentAud = currentPrice != null && plannedStopPrice != null && fxRateToAud != null
      ? Math.max(0, (currentPrice - plannedStopPrice) * fxRateToAud * quantity)
      : null;
    const targetRewardAud = currentPrice != null && plannedTargetPrice != null && fxRateToAud != null
      ? Math.max(0, (plannedTargetPrice - currentPrice) * fxRateToAud * quantity)
      : null;
    const rewardRiskRatio = targetRewardAud != null && riskFromCurrentAud != null && riskFromCurrentAud > 0
      ? targetRewardAud / riskFromCurrentAud
      : null;
    const sector = recordedSectorForPosition(position);
    const sectorRelativeStrength = relativeStrength(position, plan, sector, pricesBySymbol);
    const stopOrders = matchStopsForPosition(position, activeOrders);
    const brokerStop = brokerStopState(position, plan, stopOrders, capturedAt);
    const exceptions = rowExceptions({ position, plan, brokerStop, relativeStrength: sectorRelativeStrength, plannedStopPrice, currentPrice, capturedAt });

    return {
      positionId: position.id,
      ownerType: position.ownerType,
      broker: position.broker,
      accountKey: position.accountKey,
      instrumentKey: position.instrumentKey,
      symbol: position.symbol,
      name: position.name,
      exchange: position.exchange,
      currency: position.currency,
      sector,
      quantity,
      averageCostAud,
      currentPrice,
      currentPriceAud,
      marketValueAud: position.marketValueAud,
      stopType: plan?.stopType ?? null,
      plannedStopPrice,
      plannedStopPriceAud,
      plannedTargetPrice,
      riskFromEntryAud,
      riskFromCurrentAud,
      riskPercentNav: riskFromCurrentAud != null && dashboard.totalValue ? riskFromCurrentAud / dashboard.totalValue * 100 : null,
      riskPercentPosition: riskFromCurrentAud != null && position.marketValueAud ? riskFromCurrentAud / position.marketValueAud * 100 : null,
      targetRewardAud,
      rewardRiskRatio,
      rationale: plan?.rationale ?? null,
      invalidationNotes: plan?.invalidationNotes ?? null,
      reviewStatus: plan?.reviewStatus ?? null,
      sectorRelativeStrength,
      brokerStop,
      exceptions,
      updatedAt: plan?.updatedAt ?? null,
    } satisfies StopRiskRow;
  }).sort((left, right) => {
    const leftCritical = left.exceptions.some((item) => item.severity === "critical") ? 1 : 0;
    const rightCritical = right.exceptions.some((item) => item.severity === "critical") ? 1 : 0;
    return rightCritical - leftCritical || (right.riskFromCurrentAud ?? 0) - (left.riskFromCurrentAud ?? 0) || right.marketValueAud - left.marketValueAud;
  });

  const sectors = buildGroupSummaries(rows, dashboard.totalValue, "sector");
  const accounts = buildGroupSummaries(rows, dashboard.totalValue, "account");
  const totalStopRiskAud = rows.reduce((sum, row) => sum + (row.riskFromCurrentAud ?? 0), 0);
  const largestRow = rows.reduce<StopRiskRow | null>((largest, row) => (row.riskFromCurrentAud ?? 0) > (largest?.riskFromCurrentAud ?? 0) ? row : largest, null);
  const largestSector = sectors[0] ?? null;
  const positionsWithStops = rows.filter((row) => row.plannedStopPrice != null).length;
  const pendingOrderCapitalAud = entryOrders.reduce((sum, order) => sum + (order.estimatedCapitalAud ?? 0), 0);
  const capitalValues = Object.values(capitalByOwner);
  const deployableCashAud = capitalValues.reduce((sum, policy) => sum + policy.deployableCashAud, 0);
  const criticalExceptions = rows.reduce((sum, row) => sum + row.exceptions.filter((item) => item.severity === "critical").length, 0);
  const warningExceptions = rows.reduce((sum, row) => sum + row.exceptions.filter((item) => item.severity === "warning").length, 0);
  const unclassifiedBrokerOrders = orderReviews.filter((order) => order.purpose === "UNCLASSIFIED").length;

  return {
    summary: {
      scope,
      navAud: dashboard.totalValue,
      investedCapitalAud: dashboard.investedValue,
      cashAud: dashboard.cashValue,
      deployableCashAud,
      pendingOrderCapitalAud,
      pendingOrderCapitalMissingFx: entryOrders.filter((order) => order.estimatedCapitalAud == null).length,
      totalStopRiskAud,
      totalStopRiskPercentNav: dashboard.totalValue ? totalStopRiskAud / dashboard.totalValue * 100 : 0,
      positions: rows.length,
      positionsWithStops,
      positionsWithoutStops: rows.length - positionsWithStops,
      largestSinglePositionRiskAud: largestRow?.riskFromCurrentAud ?? 0,
      largestSinglePositionRiskSymbol: largestRow?.symbol ?? null,
      largestSectorRiskAud: largestSector?.riskAud ?? 0,
      largestSectorRiskLabel: largestSector?.label ?? null,
      criticalExceptions,
      warningExceptions,
      unclassifiedBrokerOrders,
      calculationVersion: RISK_CALCULATION_VERSION,
      capturedAt,
    },
    rows,
    entryOrders,
    brokerOrders: orderReviews,
    sectors,
    accounts,
    capitalByOwner,
    history,
  };
}

export async function recordStopsRiskSnapshot(storage: StorageAdapter, scope: Scope = "overall") {
  const dashboard = await buildStopsRiskDashboard(storage, scope);
  return storage.recordRiskSnapshot({
    scope,
    capturedAt: dashboard.summary.capturedAt,
    navAud: dashboard.summary.navAud,
    investedCapitalAud: dashboard.summary.investedCapitalAud,
    deployableCashAud: dashboard.summary.deployableCashAud,
    pendingOrderCapitalAud: dashboard.summary.pendingOrderCapitalAud,
    totalStopRiskAud: dashboard.summary.totalStopRiskAud,
    totalStopRiskPercentNav: dashboard.summary.totalStopRiskPercentNav,
    positionsWithStops: dashboard.summary.positionsWithStops,
    positionsWithoutStops: dashboard.summary.positionsWithoutStops,
    largestSinglePositionRiskAud: dashboard.summary.largestSinglePositionRiskAud,
    largestSectorRiskAud: dashboard.summary.largestSectorRiskAud,
    calculationVersion: RISK_CALCULATION_VERSION,
  });
}
