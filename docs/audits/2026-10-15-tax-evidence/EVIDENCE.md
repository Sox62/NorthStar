# Audit evidence and reproducible observations

15 October 2026. These observations refer to the inspected working tree, not an independently observed production deployment. Financial example amounts are synthetic except AUD-001 and the explicitly identified legacy snapshot report.

## Commands and observed results

From `/Users/sox/Desktop/SouthernStar`:

```sh
npm test
```

Observed: **399 tests, 399 pass, 0 fail, 0 skipped**. Execution output retained at `/private/tmp/southernstar-tax-audit-20261015-baseline.tap`. Tests exercise fixtures/mocks and a disposable local maintenance store. No production connection was configured.

```sh
node --import tsx --test lib/tax-lots.test.ts lib/reports/eofy.test.ts lib/reports/report-period.test.ts lib/parcel-selection.test.ts lib/integrations/ibkr.test.ts lib/sync/ibkr-flex.test.ts lib/integrations/directshares-trades.test.ts lib/integrations/dividends.test.ts lib/core/accounting.test.ts lib/storage/delete-transactions.test.ts
```

Observed: **114 tests, 114 pass, 0 fail, 0 skipped**. Output: `/private/tmp/southernstar-tax-audit-20261015-targeted.tap`.

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Observed: exit 2; conflicting duplicate generated declarations in `.next/types/cache-life.d 2.ts` and `.next/types/routes.d 2.ts`. Diagnostics retained at `/private/tmp/southernstar-tax-audit-20261015-typecheck.log`. A TypeScript-API diagnostic check using the same parsed project options, excluding only those files and `.next/types/validator 2.ts`, reports **0 diagnostics**. This is qualified evidence about generated duplicates, not a passing standard typecheck or production build.

## Source records and limitations

The local store `.north-star/data.json` is ignored by Git. It contains 123 personal Directshares All Trades records, date range 2024-07-11 through 2026-06-16; 26 positions; two cash balances; five import summaries. It contains no IBKR transaction rows, no SMSF trade rows and no income payments. Source authenticity/completeness and relationship to deployed PostgreSQL were not established. Raw transaction payloads and financial records were not copied into these audit documents.

Hash before and after reading/report generation: `77417095dfbfa895d27be79f9fb9cfb06ddb6a8a833551da8cafd2c234cd3f03`.

No original source statement was located in the repository data/imports/fixtures/tests/backups locations inspected. No relevant DATABASE_URL or IBKR credentials were present in the shell or `.env.local` inspection. The existence of a deployed database or remote evidence repository is not denied; access/content were simply not verified.

## Probe index

| Probe | Input / independent expectation | Finding |
|---|---|---|
| P01 | Buy 1 for 100, buy 1 for 200, sell 1 for 300 with LIFO | Realised cost 200; historical cost 100. F02. |
| P02 | USD100 buy/USD200 sale, no conversion rate | Definitive AUD cost/gain should be unknown; both become 100. F04. |
| P03 / P14 | USD100 cost + USD10 commission at 1.5 AUD/USD | Cost should be 165, engine gives 160; confirmed through Flex parser in P14. F03. |
| P04 / P15 | Gross USD110/net100/withheld10 at 1.5 | Gross should be AUD165, report gives 110; confirmed through dividend CSV parser in P15. F03. |
| P05 | Buy 2025-06-20, sell 2026-06-19/20/21 | 364/365/366-day probes; anniversary wrongly qualifies, per official ATO example. F05. |
| P06 | CashReport plus two CashTransaction entries | Valid report accepted; 0 transaction rows from those cash entries. G01. |
| P07 | Range starts 2026-02-30 | Invalid calendar day accepted. F11. |
| P08 | One IBKR row imported twice, then same ID with amended cost | Exact repeat adds 0; raw lost; amendment silently skipped. F08/F09. |
| P09 | Same owner, two different IBKR account balances 100 and 200 | Active cash 200 versus expected 300. F07. |
| P10 | Real legacy snapshot via current read-only adapter and price book | Final local results below; old-brief comparison not externally verified. |
| P11 | Independently recompute one fully matched persisted AUD parcel | Cost/gain agree; original source statement not available. |
| P12 | Personal profile set to pension true in disposable store | Personal short-term gain 100 becomes taxable 0. F01. |
| P13 | Buy 2 before EOFY, sell 1 after EOFY, current holding 1 | Historical closing quantity 2; EOFY lot quantity 1 with full historic value. F10. |
| P16 | Same buy/sell represented in Activity and Confirmation feeds | Canonical gain has one disposal, schedules include both copies. F02. |

The probes intentionally inspect actual output; they are not assertions added to the product test suite. Each case's expected arithmetic comes from the supplied amounts, except P05, whose rule is checked against [ATO guidance](https://smallbusiness.taxsuperandyou.gov.au/capital-gains-tax/the-discount-method). These results do not measure production exposure.

## Final local-snapshot report result

This run uses `LocalStorageAdapter.dashboard`, `listTransactions`, `listPriceBook(2000)` and `listTaxProfiles` only, followed by pure report/CSV functions. It uses the available price data, unlike the early minimal-dashboard stress probe. Fixed generation time: `2026-10-15T01:00:00Z` (12:00 AEDT). Repeated fixed inputs produce identical CSV.

```json
{
  "snapshotSha256": "77417095dfbfa895d27be79f9fb9cfb06ddb6a8a833551da8cafd2c234cd3f03",
  "unchangedAfterRead": true,
  "transactionCount": 123,
  "holdingCount": 15,
  "priceRows": 754,
  "fxRows": 13,
  "method": {
    "method": "fifo"
  },
  "financialYear": {
    "year": 2026,
    "label": "FY2026",
    "startDate": "2025-07-01",
    "endDate": "2026-06-30"
  },
  "realisedLots": 56,
  "unmatchedLots": 1,
  "netCapitalGainAud": 229693.15924816584,
  "reconciliationStatus": "review",
  "reconciliationReview": [
    {
      "check": "Realised proceeds subtotal",
      "varianceAud": 4086.5799999998417,
      "detail": "Sell proceeds should tie to the realised CGT lot proceeds after lot splitting."
    },
    {
      "check": "Realised cost base subtotal",
      "varianceAud": 812.880312796915,
      "detail": "Historical cost-of-sales should tie to realised CGT lot cost bases."
    },
    {
      "check": "Closing cost movement",
      "varianceAud": 13028.282268750132,
      "detail": "Closing historical cost should equal opening cost plus purchases less cost of sales plus adjustments."
    },
    {
      "check": "Missing EOFY price or FX rows",
      "varianceAud": null,
      "detail": "12 rows missing EOFY price and 0 rows missing FX."
    },
    {
      "check": "Missing acquisition history",
      "varianceAud": null,
      "detail": "1 realised CGT lot need acquisition history review."
    }
  ],
  "grossIncomeAud": 0,
  "dividendPayments": 0,
  "missingHistoricalValuations": 12,
  "csvContainsRoundedSummary": true,
  "sameInputsSameCsv": true
}
```

The zero real income rows, missing acquisition and historical prices prevent a complete tax-source reconciliation. The $195,597 benchmark is an assertion in an older brief, not an original expected-result file. The local report's $229,693.16 is not claimed to supersede an accountant's return.

## Recorded synthetic/persisted-row probe output

```json
[
  {
    "id": "P01-lifo-historical",
    "realisedCostAud": 200,
    "expectedCostAud": 200,
    "historicalCostOfSalesAud": 100,
    "historicalMethod": "FIFO",
    "reconciliation": [
      {
        "section": "CGT",
        "check": "Realised cost base subtotal",
        "reportedAud": 100,
        "referenceAud": 200,
        "varianceAud": -100,
        "status": "review",
        "detail": "Historical cost-of-sales should tie to realised CGT lot cost bases."
      }
    ]
  },
  {
    "id": "P02-missing-fx",
    "costAud": 100,
    "gainAud": 100,
    "note": "First in, first out match from imported transactions.",
    "expected": "AUD amount unknown, missing FX exception required"
  },
  {
    "id": "P03-foreign-fees",
    "expectedBuyCostAud": 165,
    "actualBuyCostAud": 160,
    "historicalBuyCostAud": 165,
    "expectedGainAud": 120,
    "actualGainAud": 125
  },
  {
    "id": "P04-foreign-income",
    "grossIncomeAud": 110,
    "netIncomeAud": 150,
    "taxWithheldAud": 15,
    "expectedGrossIncomeAud": 165
  },
  {
    "id": "P05-boundary-364",
    "acquired": "2025-06-20",
    "sold": "2026-06-19",
    "heldDays": 364,
    "eligible": false,
    "taxableGainAud": 100
  },
  {
    "id": "P05-boundary-365",
    "acquired": "2025-06-20",
    "sold": "2026-06-20",
    "heldDays": 365,
    "eligible": true,
    "taxableGainAud": 50
  },
  {
    "id": "P05-boundary-366",
    "acquired": "2025-06-20",
    "sold": "2026-06-21",
    "heldDays": 366,
    "eligible": true,
    "taxableGainAud": 50
  },
  {
    "id": "P06-cash-section",
    "statementCashTransactions": 2,
    "parsedTransactions": 0,
    "aggregateCashAud": 100
  },
  {
    "id": "P07-invalid-date",
    "accepted": {
      "label": "2026-02-30 to 2026-06-30",
      "startDate": "2026-02-30",
      "endDate": "2026-06-30",
      "scoped": true
    }
  },
  {
    "id": "P08-local-idempotency-provenance",
    "firstImported": 1,
    "reimportImported": 0,
    "reimportDuplicates": 1,
    "storedCount": 1,
    "rawRetained": false,
    "correctionDuplicates": 1,
    "storedOriginalCost": 100,
    "amendedCost": 150
  },
  {
    "id": "P09-two-accounts-cash",
    "expectedAggregateCashAud": 300,
    "activeCashAud": 200,
    "activeAccounts": 1
  },
  {
    "id": "P11-independent-AUD-sample",
    "sample": "AUD-001",
    "buyRowHash": "a5846220c462",
    "saleRowHash": "04834facc3b6",
    "acquisitionDate": "2025-06-04",
    "saleDate": "2026-06-16",
    "matchedQuantity": 240,
    "independentCostAud": 19901.13501369863,
    "reportedCostAud": 19901.13501369863,
    "independentGainAud": 9953.184986301369,
    "reportedGainAud": 9953.18498630137,
    "originalStatementAvailable": false
  },
  {
    "id": "P12-personal-pension-profile",
    "profileOwner": "PERSONAL",
    "pensionPhase": true,
    "gainAud": 100,
    "taxableGainAud": 0,
    "expectedTaxableGainAud": 100
  },
  {
    "id": "P13-EOFY-open-quantity",
    "historicalClosingQuantity": 2,
    "expectedEofyQuantity": 2,
    "openLotQuantity": 1,
    "historicalMarketValueAud": 200,
    "unrealisedMarketValueAud": 200,
    "note": "Imported transaction lots scaled to current position quantity. EOFY valuation exact from 2026-06-30. EOFY quantity 2.000000 differs from tax-lot quantity 1.000000."
  },
  {
    "id": "P14-parser-to-commission",
    "rows": 2,
    "commissionCurrency": "USD",
    "costAud": 160,
    "expectedCostAud": 165,
    "gainAud": 125,
    "expectedGainAud": 120
  },
  {
    "id": "P15-dividend-parser-to-income",
    "csvRows": 1,
    "providedFxRate": 1.5,
    "netCash": 100,
    "rawGross": 110,
    "actualGrossAud": 110,
    "expectedGrossAud": 165
  },
  {
    "id": "P16-duplicate-schedules",
    "inputRows": 4,
    "canonicalRealisedLots": 1,
    "tradeRows": 4,
    "reportedSellSummaryAud": 570,
    "canonicalSaleProceedsAud": 285,
    "historicalPurchasesAud": 330
  }
]
```

## Static findings with no live database test

F06 is supported by the exact PostgreSQL write/read relationship: FX insertion deliberately leaves `instrument_id` null, and transaction reading inner-joins instruments. No database query, production count or expected PostgreSQL idempotency execution result is presented as observed.

The schema contains numeric transaction precision and uniqueness/FK declarations, plus SQL migrations 0034/0035 for tax settings. Both migrations are listed in the repository journal. The Drizzle `portfolios` model does not declare those added columns; reconcile model/snapshot/migration drift before generating future schema changes. Deployed migration application remains not verified.

Missing document storage, batch links, transfer matching, carry-forward loss buckets and report versioning were assessed by repository schema/API/implementation searches. Their absence is recorded as a capability or verification gap, not a demonstrated incorrect production transaction.

## Durable reproduction source

[REPRODUCTION.md](REPRODUCTION.md) retains the exact temporary harnesses as documentation. They import the existing application functions without editing them. Storage mutations are restricted to a synthetic file in `/private/tmp`; the final local report harness calls read-only methods. Run each harness in a separate Node process so its data-file configuration cannot carry into a different experiment.
