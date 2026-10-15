import type { StopRiskRow } from "./stops-types";

export const STOP_GAUGE_FULL_PERCENT = 15;

type ProximityRow = Pick<StopRiskRow, "currentPrice" | "plannedStopPrice" | "stopType" | "brokerStop">;

export function stopProximity(row: ProximityRow) {
  // Broker triggers take precedence over intent recorded in SS.
  const brokerPrice = row.brokerStop.brokerStopPrice;
  const stopPrice = brokerPrice ?? row.plannedStopPrice;
  const source = brokerPrice != null ? "Broker stop" : row.stopType === "MANUAL_REVIEW" ? "Review level" : "SS plan";
  const current = row.currentPrice;
  if (stopPrice == null || !Number.isFinite(stopPrice) || stopPrice <= 0
    || current == null || !Number.isFinite(current) || current <= 0) {
    return { stopPrice, source, distancePercent: null, fillPercent: 0, tone: "unknown" as const };
  }
  const distancePercent = (current - stopPrice) / current * 100;
  const tone = distancePercent <= 0 ? "breached" as const
    : distancePercent < 5 ? "danger" as const
      : distancePercent <= 10 ? "warning" as const : "good" as const;
  return {
    stopPrice, source, distancePercent, tone,
    fillPercent: Math.min(100, Math.max(0, distancePercent / STOP_GAUGE_FULL_PERCENT * 100)),
  };
}
