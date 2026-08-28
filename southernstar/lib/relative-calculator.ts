import { buildRatioSeries, relativeReturnWindows, type RatioHistoryPoint } from "./ratio-engine";

export type RelativeCalculatorInput = {
  leftLabel: string;
  rightLabel: string;
  leftStartPrice: number;
  leftEndPrice: number;
  leftStartFxToAud: number;
  leftEndFxToAud: number;
  rightStartPrice: number;
  rightEndPrice: number;
  rightStartFxToAud: number;
  rightEndFxToAud: number;
};

export type RelativeCalculatorResult = {
  leftLabel: string;
  rightLabel: string;
  leftStartAud: number;
  leftEndAud: number;
  rightStartAud: number;
  rightEndAud: number;
  leftLocalReturnPercent: number;
  rightLocalReturnPercent: number;
  leftAudReturnPercent: number;
  rightAudReturnPercent: number;
  ratioStart: number;
  ratioEnd: number;
  ratioReturnPercent: number;
  rawRatioStart: number;
  rawRatioEnd: number;
  rawRatioReturnPercent: number;
  fxRatioStart: number;
  fxRatioEnd: number;
  fxRatioReturnPercent: number;
  fxContributionPercent: number;
  winner: "left" | "right" | "flat";
  interpretation: string;
};

export function calculateRelativeRelationship(input: RelativeCalculatorInput): RelativeCalculatorResult {
  const cleaned = cleanInput(input);
  const leftStartAud = cleaned.leftStartPrice * cleaned.leftStartFxToAud;
  const leftEndAud = cleaned.leftEndPrice * cleaned.leftEndFxToAud;
  const rightStartAud = cleaned.rightStartPrice * cleaned.rightStartFxToAud;
  const rightEndAud = cleaned.rightEndPrice * cleaned.rightEndFxToAud;
  const series = buildRatioSeries([
    manualPoint("1970-01-01", cleaned.leftStartPrice, cleaned.leftStartFxToAud),
    manualPoint("1970-01-02", cleaned.leftEndPrice, cleaned.leftEndFxToAud),
  ], [
    manualPoint("1970-01-01", cleaned.rightStartPrice, cleaned.rightStartFxToAud),
    manualPoint("1970-01-02", cleaned.rightEndPrice, cleaned.rightEndFxToAud),
  ]);
  const first = series[0];
  const last = series.at(-1);
  const window = relativeReturnWindows(series).find((item) => item.key === "all");
  if (!first || !last || !window) throw new Error("Manual comparison could not be calculated.");
  const leftLocalReturnPercent = window.leftLocalReturnPercent!;
  const rightLocalReturnPercent = window.rightLocalReturnPercent!;
  const leftAudReturnPercent = window.leftReturnPercent!;
  const rightAudReturnPercent = window.rightReturnPercent!;
  const ratioStart = first.ratio / 100;
  const ratioEnd = last.ratio / 100;
  const ratioReturnPercent = window.ratioReturnPercent!;
  const rawRatioStart = first.rawRatio / 100;
  const rawRatioEnd = last.rawRatio / 100;
  const rawRatioReturnPercent = window.rawRatioReturnPercent!;
  const fxRatioStart = first.fxRatio;
  const fxRatioEnd = last.fxRatio;
  const fxRatioReturnPercent = window.fxRatioReturnPercent!;
  const fxContributionPercent = window.fxContributionPercent!;
  const winner = Math.abs(ratioReturnPercent) < 0.000001 ? "flat" : ratioReturnPercent > 0 ? "left" : "right";
  const interpretation = winner === "flat"
    ? `${cleaned.leftLabel} and ${cleaned.rightLabel} were flat relative to each other on an AUD-normalised basis.`
    : winner === "left"
      ? `${cleaned.leftLabel} outperformed ${cleaned.rightLabel} by ${formatPercent(ratioReturnPercent)} on an AUD-normalised ratio basis.`
      : `${cleaned.leftLabel} underperformed ${cleaned.rightLabel} by ${formatPercent(Math.abs(ratioReturnPercent))} on an AUD-normalised ratio basis.`;
  return {
    leftLabel: cleaned.leftLabel,
    rightLabel: cleaned.rightLabel,
    leftStartAud,
    leftEndAud,
    rightStartAud,
    rightEndAud,
    leftLocalReturnPercent,
    rightLocalReturnPercent,
    leftAudReturnPercent,
    rightAudReturnPercent,
    ratioStart,
    ratioEnd,
    ratioReturnPercent,
    rawRatioStart,
    rawRatioEnd,
    rawRatioReturnPercent,
    fxRatioStart,
    fxRatioEnd,
    fxRatioReturnPercent,
    fxContributionPercent,
    winner,
    interpretation,
  };
}

function cleanInput(input: RelativeCalculatorInput): RelativeCalculatorInput {
  const cleaned = {
    ...input,
    leftLabel: input.leftLabel.trim() || "Asset A",
    rightLabel: input.rightLabel.trim() || "Asset B",
  };
  for (const [key, value] of Object.entries(cleaned)) {
    if (typeof value !== "number") continue;
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${labelForKey(key)} must be greater than zero.`);
  }
  return cleaned;
}

function manualPoint(date: string, close: number, fxRateToAud: number): RatioHistoryPoint {
  return {
    date,
    close,
    currency: "MANUAL",
    fxRateToAud,
    valueAud: close * fxRateToAud,
    source: "Manual calculator input",
  };
}

function formatPercent(value: number) {
  return `${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;
}

function labelForKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}
