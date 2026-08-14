import assert from "node:assert/strict";
import test from "node:test";
import { calculateRelativeRelationship } from "./relative-calculator";

function closeTo(actual: number, expected: number, delta = 0.000001) {
  assert.ok(Math.abs(actual - expected) <= delta, `expected ${actual} to be within ${delta} of ${expected}`);
}

test("calculateRelativeRelationship compares two AUD assets", () => {
  const result = calculateRelativeRelationship({
    leftLabel: "SLVM",
    rightLabel: "Gold",
    leftStartPrice: 20,
    leftEndPrice: 30,
    leftStartFxToAud: 1,
    leftEndFxToAud: 1,
    rightStartPrice: 4000,
    rightEndPrice: 4400,
    rightStartFxToAud: 1,
    rightEndFxToAud: 1,
  });
  closeTo(result.leftAudReturnPercent, 50);
  closeTo(result.rightAudReturnPercent, 10);
  closeTo(result.ratioReturnPercent, 36.3636363636);
  assert.equal(result.winner, "left");
});

test("calculateRelativeRelationship separates local and FX-adjusted AUD returns", () => {
  const result = calculateRelativeRelationship({
    leftLabel: "XLE",
    rightLabel: "Gold",
    leftStartPrice: 60,
    leftEndPrice: 60,
    leftStartFxToAud: 1.5,
    leftEndFxToAud: 1.65,
    rightStartPrice: 3000,
    rightEndPrice: 3300,
    rightStartFxToAud: 1.5,
    rightEndFxToAud: 1.65,
  });
  closeTo(result.leftLocalReturnPercent, 0);
  closeTo(result.leftAudReturnPercent, 10);
  closeTo(result.rightLocalReturnPercent, 10);
  closeTo(result.rightAudReturnPercent, 21);
  closeTo(result.ratioReturnPercent, -9.0909090909);
  assert.equal(result.winner, "right");
});

test("calculateRelativeRelationship rejects zero inputs", () => {
  assert.throws(() => calculateRelativeRelationship({
    leftLabel: "A",
    rightLabel: "B",
    leftStartPrice: 0,
    leftEndPrice: 1,
    leftStartFxToAud: 1,
    leftEndFxToAud: 1,
    rightStartPrice: 1,
    rightEndPrice: 1,
    rightStartFxToAud: 1,
    rightEndFxToAud: 1,
  }), /must be greater than zero/);
});
