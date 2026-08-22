export type TaxJurisdictionCode = "AU" | "UK" | "US";

export type TaxYearBasis = "australian_financial_year" | "uk_tax_year" | "calendar_year";

export type TaxJurisdiction = {
  code: TaxJurisdictionCode;
  label: string;
  taxCurrency: "AUD" | "GBP" | "USD";
  taxYearBasis: TaxYearBasis;
  yearStartMonth: number;
  yearStartDay: number;
  yearEndMonth: number;
  yearEndDay: number;
  notes: string;
};

export const taxJurisdictions: Record<TaxJurisdictionCode, TaxJurisdiction> = {
  AU: {
    code: "AU",
    label: "Australia",
    taxCurrency: "AUD",
    taxYearBasis: "australian_financial_year",
    yearStartMonth: 7,
    yearStartDay: 1,
    yearEndMonth: 6,
    yearEndDay: 30,
    notes: "Current SouthernStar EOFY reports use Australian personal tax treatment, including franking credits and CGT discount logic.",
  },
  UK: {
    code: "UK",
    label: "United Kingdom",
    taxCurrency: "GBP",
    taxYearBasis: "uk_tax_year",
    yearStartMonth: 4,
    yearStartDay: 6,
    yearEndMonth: 4,
    yearEndDay: 5,
    notes: "Reserved for future UK tax treatment. Do not apply Australian franking or CGT discount assumptions.",
  },
  US: {
    code: "US",
    label: "United States",
    taxCurrency: "USD",
    taxYearBasis: "calendar_year",
    yearStartMonth: 1,
    yearStartDay: 1,
    yearEndMonth: 12,
    yearEndDay: 31,
    notes: "Reserved for future US tax treatment. Do not apply Australian franking or CGT discount assumptions.",
  },
};

export function taxJurisdiction(code: TaxJurisdictionCode) {
  return taxJurisdictions[code];
}
