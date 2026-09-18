import type { CapitalPolicySummary } from "@/lib/capital-policy";
import type {
  OrderPurpose,
  OwnerType,
  RiskExceptionCode,
  RiskSnapshot,
  Scope,
  StopType,
} from "@/lib/storage";
import type { Sector } from "@/southernstar/types";

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
