import assert from "node:assert/strict";
import test from "node:test";
import { instrumentQuoteCurrency } from "./postgres/helpers";

test("instrumentQuoteCurrency keeps foreign listings from being stored as AUD settlement currency", () => {
  assert.equal(instrumentQuoteCurrency("US", "AUD"), "USD");
  assert.equal(instrumentQuoteCurrency("NYSE", "AUD"), "USD");
  assert.equal(instrumentQuoteCurrency("TSX/TSXV", "AUD"), "CAD");
  assert.equal(instrumentQuoteCurrency("LSE", "AUD"), "GBP");
});

test("instrumentQuoteCurrency preserves explicit non-AUD quote currencies", () => {
  assert.equal(instrumentQuoteCurrency("LSE", "USD"), "USD");
  assert.equal(instrumentQuoteCurrency("ASX", "AUD"), "AUD");
});
