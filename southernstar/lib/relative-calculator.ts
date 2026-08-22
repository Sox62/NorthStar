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
  winner: "left" | "right" | "flat";
  interpretation: string;
};

export function calculateRelativeRelationship(input: RelativeCalculatorInput): RelativeCalculatorResult {
  const cleaned = cleanInput(input);
  const leftStartAud = cleaned.leftStartPrice * cleaned.leftStartFxToAud;
  const leftEndAud = cleaned.leftEndPrice * cleaned.leftEndFxToAud;
  const rightStartAud = cleaned.rightStartPrice * cleaned.rightStartFxToAud;
  const rightEndAud = cleaned.rightEndPrice * cleaned.rightEndFxToAud;
  const leftLocalReturnPercent = pctReturn(cleaned.leftStartPrice, cleaned.leftEndPrice);
  const rightLocalReturnPercent = pctReturn(cleaned.rightStartPrice, cleaned.rightEndPrice);
  const leftAudReturnPercent = pctReturn(leftStartAud, leftEndAud);
  const rightAudReturnPercent = pctReturn(rightStartAud, rightEndAud);
  const ratioStart = leftStartAud / rightStartAud;
  const ratioEnd = leftEndAud / rightEndAud;
  const ratioReturnPercent = pctReturn(ratioStart, ratioEnd);
  const winner = Math.abs(ratioReturnPercent) < 0.000001 ? "flat" : ratioReturnPercent > 0 ? "left" : "right";
  const interpretation = winner === "flat"
    ? `${cleaned.leftLabel} and ${cleaned.rightLabel} were flat relative to each other on an AUD basis.`
    : winner === "left"
      ? `${cleaned.leftLabel} outperformed ${cleaned.rightLabel} by ${formatPercent(ratioReturnPercent)} on an AUD ratio basis.`
      : `${cleaned.leftLabel} underperformed ${cleaned.rightLabel} by ${formatPercent(Math.abs(ratioReturnPercent))} on an AUD ratio basis.`;
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

function pctReturn(start: number, end: number) {
  return end / start * 100 - 100;
}

function formatPercent(value: number) {
  return `${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;
}

function labelForKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}
