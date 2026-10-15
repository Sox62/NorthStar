import assert from "node:assert/strict";
import test from "node:test";
import { pensionPhaseApplies, pensionPhaseFor } from "./pension-phase";

test("pension phase belongs to the fund alone", () => {
  assert.equal(pensionPhaseApplies("SMSF"), true);
  assert.equal(pensionPhaseApplies("PERSONAL"), false);
});

test("a flag stored against a Personal book never takes effect", () => {
  /*
   * Read-side coercion is the point: a value already sitting in storage would otherwise report
   * every personal capital gain as untaxed until someone found and cleared it.
   */
  assert.equal(pensionPhaseFor("PERSONAL", true), false);
  assert.equal(pensionPhaseFor("PERSONAL", false), false);
  assert.equal(pensionPhaseFor("SMSF", true), true);
  assert.equal(pensionPhaseFor("SMSF", false), false);
  assert.equal(pensionPhaseFor("SMSF", null), false, "absent is accumulation, not exempt");
  assert.equal(pensionPhaseFor("SMSF", undefined), false);
});
