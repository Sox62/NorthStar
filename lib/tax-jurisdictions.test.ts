import assert from "node:assert/strict";
import { test } from "node:test";
import { taxJurisdiction } from "./tax-jurisdictions";

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
