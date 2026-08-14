import type { DashboardData, OwnerType, StoredOpenOrder } from "@/lib/storage";

export type OwnerCapitalPolicy = {
  ownerType: OwnerType;
  role: string;
  mandate: string;
  liquidityFloorAud: number;
  deploymentPriority: string;
  protectedCapitalNote: string;
};

export type CapitalPolicySummary = OwnerCapitalPolicy & {
  cashAud: number;
  openBuyCommitmentAud: number;
  foreignOpenBuyCount: number;
  deployableCashAud: number;
  status: "deployable" | "floor" | "depleted";
};

export const ownerCapitalPolicies: Record<OwnerType, OwnerCapitalPolicy> = {
  PERSONAL: {
    ownerType: "PERSONAL",
    role: "Secondary deployment pool plus strategic taxable holdings",
    mandate: "Personal IBKR can deploy once the setup earns capital. Directshares remains strategic / last-resort capital.",
    liquidityFloorAud: 0,
    deploymentPriority: "Use after SMSF standards or cash floor make Personal the better book.",
    protectedCapitalNote: "External bank and house reserves stay outside deployable trading capital unless explicitly reclassified.",
  },
  SMSF: {
    ownerType: "SMSF",
    role: "Primary tax-efficient commodity-cycle account",
    mandate: "Use for the best asymmetric setups only; low tax friction should still have high decision friction.",
    liquidityFloorAud: 50_000,
    deploymentPriority: "First preference while deployable cash remains above the SMSF floor.",
    protectedCapitalNote: "Cash floor, fees and known liabilities are not deployable capital.",
  },
};

const inactiveOrderStatuses = new Set(["cancelled", "canceled", "filled", "inactive", "completed", "stopped"]);

function activeBuyOrder(order: StoredOpenOrder) {
  return order.side.toUpperCase().startsWith("BUY") && !inactiveOrderStatuses.has(order.status.toLowerCase());
}

function remainingQuantity(order: StoredOpenOrder) {
  if (order.remainingQuantity != null) return Math.max(0, order.remainingQuantity);
  const total = order.totalQuantity ?? 0;
  const filled = order.filledQuantity ?? 0;
  return Math.max(0, total - filled);
}

function commitmentPrice(order: StoredOpenOrder) {
  return order.limitPrice ?? order.stopPrice ?? order.averagePrice ?? 0;
}

export function openBuyCommitmentAud(orders: StoredOpenOrder[]) {
  let aud = 0;
  let foreignCount = 0;
  for (const order of orders) {
    if (!activeBuyOrder(order)) continue;
    const quantity = remainingQuantity(order);
    const price = commitmentPrice(order);
    if (!quantity || !price) continue;
    if (order.currency.toUpperCase() === "AUD") aud += quantity * price;
    else foreignCount += 1;
  }
  return { aud, foreignCount };
}

export function buildCapitalPolicySummary(account: DashboardData, openOrders: StoredOpenOrder[]): CapitalPolicySummary {
  const ownerType = account.scope === "smsf" ? "SMSF" : "PERSONAL";
  const policy = ownerCapitalPolicies[ownerType];
  const commitments = openBuyCommitmentAud(openOrders.filter(order => order.ownerType === ownerType));
  const deployableCashAud = Math.max(0, account.cashValue - policy.liquidityFloorAud - commitments.aud);
  const status: CapitalPolicySummary["status"] =
    deployableCashAud <= 0 ? "depleted" : account.cashValue < policy.liquidityFloorAud ? "floor" : "deployable";
  return {
    ...policy,
    cashAud: account.cashValue,
    openBuyCommitmentAud: commitments.aud,
    foreignOpenBuyCount: commitments.foreignCount,
    deployableCashAud,
    status,
  };
}
