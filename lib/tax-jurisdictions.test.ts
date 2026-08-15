import assert from "node:assert/strict";
import { test } from "node:test";
import { taxJurisdiction } from "./tax-jurisdictions";
import { defaultTaxYearEnding, taxYear, taxYearFromRequest } from "./reports/eofy/utils";

test("tax jurisdiction registry keeps AU, UK and US year bases explicit", () => {
  assert.deepEqual(
    {
      code: taxJurisdiction("AU").code,
      currency: taxJurisdiction("AU").taxCurrency,
      basis: taxJurisdiction("AU").taxYearBasis,
      start: `${taxJurisdiction("AU").yearStartMonth}-${taxJurisdiction("AU").yearStartDay}`,
      end: `${taxJurisdiction("AU").yearEndMonth}-${taxJurisdiction("AU").yearEndDay}`,
    },
    { code: "AU", currency: "AUD", basis: "australian_financial_year", start: "7-1", end: "6-30" },
  );

  assert.equal(taxJurisdiction("UK").taxYearBasis, "uk_tax_year");
  assert.equal(taxJurisdiction("UK").taxCurrency, "GBP");
  assert.equal(taxJurisdiction("UK").yearStartMonth, 4);
  assert.equal(taxJurisdiction("UK").yearStartDay, 6);
  assert.equal(taxJurisdiction("UK").yearEndMonth, 4);
  assert.equal(taxJurisdiction("UK").yearEndDay, 5);

  assert.equal(taxJurisdiction("US").taxYearBasis, "calendar_year");
  assert.equal(taxJurisdiction("US").taxCurrency, "USD");
});


test("tax year helpers derive AU, UK and US ranges from the jurisdiction registry", () => {
  assert.deepEqual(taxYear("AU", 2026), { year: 2026, label: "FY2026", startDate: "2025-07-01", endDate: "2026-06-30" });
  assert.deepEqual(taxYear("UK", 2026), { year: 2026, label: "FY2026", startDate: "2025-04-06", endDate: "2026-04-05" });
  assert.deepEqual(taxYear("US", 2026), { year: 2026, label: "2026", startDate: "2026-01-01", endDate: "2026-12-31" });
});

test("default tax year ending uses the relevant jurisdiction boundary", () => {
  assert.equal(defaultTaxYearEnding("AU", new Date("2026-06-30T00:00:00.000Z")), 2025);
  assert.equal(defaultTaxYearEnding("AU", new Date("2026-07-01T00:00:00.000Z")), 2026);
  assert.equal(defaultTaxYearEnding("UK", new Date("2026-04-05T00:00:00.000Z")), 2025);
  assert.equal(defaultTaxYearEnding("UK", new Date("2026-04-06T00:00:00.000Z")), 2026);
  assert.equal(defaultTaxYearEnding("US", new Date("2026-01-01T00:00:00.000Z")), 2026);
});

test("tax year request parsing falls back per jurisdiction", () => {
  assert.equal(taxYearFromRequest("AU", "2026", new Date("2026-08-15T00:00:00.000Z")), 2026);
  assert.equal(taxYearFromRequest("UK", "bad", new Date("2026-03-01T00:00:00.000Z")), 2025);
  assert.equal(taxYearFromRequest("US", null, new Date("2026-08-15T00:00:00.000Z")), 2026);
});
