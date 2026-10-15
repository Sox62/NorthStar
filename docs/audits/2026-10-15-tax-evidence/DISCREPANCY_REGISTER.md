# Discrepancy register

15 October 2026. All financial impacts below are **synthetic examples**, except explicitly identified local-snapshot observations. Production populations, affected balances and historical elections are not known. No critical production incident was established. Severity measures potential impact under the stated trigger.

## F01 — High — Personal profiles can enable pension exemption

**Type/status:** correctness defect; reproduced in isolated local storage and confirmed by API/reader inspection.  
**Scope:** personal tax-lot/position surfaces that read the personal profile; all dates governed by that current setting. The personal EOFY route separately forces pension false.

The user confirmed on 15 October 2026 that the SMSF is in **100% pension phase**. This is the current SMSF business rule; F01 concerns preventing that treatment from being assigned to Personal records. Deployed profile values were not inspected.

- Reproduce P12: `setTaxProfile('PERSONAL', true)` is accepted; build personal lots from a $100 buy and a $200 short-term sale with this stored treatment. Output gain is $100 and taxable gain is $0; expected $100 before other offsets.
- Cause: [tax-profile API](/Users/sox/Desktop/SouthernStar/app/api/tax-profiles/route.ts:16) accepts both owners with an unrestricted flag; [tax-lots API](/Users/sox/Desktop/SouthernStar/app/api/tax-lots/route.ts:44) trusts that profile. The normal UI's SMSF-only control does not enforce this invariant at persistence/API boundaries.
- Proposed correction: restrict exemption to validated SMSF treatment in API, storage and calculation boundary. Inspect existing profiles before any repair. No personal production profile was read or modified.

## F02 — High — EOFY schedules still use inconsistent transaction/parcel calculations

**Type/status:** report consistency defect; reproduced with election and duplicate fixtures.  
**Scope:** personal EOFY years containing non-FIFO elections, duplicated exports, corporate actions, account aliases or differing fee conventions.

- P01: buys of one unit for $100 and $200; sale for $300; LIFO election. Canonical realised cost is $200; historical cost-of-sales remains $100 and is labeled FIFO. The reconciliation flags a $100 difference.
- P16: one IBKR buy and sale each appear in Activity and Confirmation sources. CGT correctly keeps one realised disposal, but trade movements retain four rows and summary sale proceeds are $570 against canonical proceeds of $285. Historical purchases double to $330.
- Cause: [historical-cost.ts](/Users/sox/Desktop/SouthernStar/lib/reports/eofy/historical-cost.ts:97) independently sorts raw BUY/SELL rows and implements FIFO. It does not consume the engine's selection, duplicate result or corporate actions. [tradeRows](/Users/sox/Desktop/SouthernStar/lib/reports/eofy/trades.ts:6) also reads raw rows. [buildEofyReport](/Users/sox/Desktop/SouthernStar/lib/reports/eofy.ts:41) assembles both paths into one pack.
- Proposed correction: derive historical movements and canonical trade schedules from the existing engine's reconciled events/lots, preserving original evidence rows separately. Keep current warnings and show source-row membership. Do not introduce another calculation engine or change elections.

## F03 — High — Monetary fields use incompatible currencies across importers/reports

**Type/status:** unit conversion defects; reproduced from actual importer functions with synthetic source files.  
**Scope:** foreign-currency IBKR commissions and generic foreign dividend CSV income. Real affected years/accounts not verified.

- P14: Flex XML buy USD100, USD10 commission (`ibCommissionCurrency=USD`), FX 1.5 AUD/USD. Correct cost is AUD165. Canonical engine reports AUD160, and a later USD190 net sale produces AUD125 gain instead of AUD120. Historical schedule reports cost AUD165.
- Directshares All Trades explicitly stores brokerage already in AUD, while Flex stores the original commission amount. [buyCostAud](/Users/sox/Desktop/SouthernStar/lib/tax-lots.ts:221) always adds fees/taxes without conversion. [historical-cost.ts](/Users/sox/Desktop/SouthernStar/lib/reports/eofy/historical-cost.ts:33) and trade rows always convert them with transaction currency, which conversely over-converts already-AUD Directshares brokerage. No normalized fee-currency field resolves this difference.
- P15: dividend CSV gross USD110/net USD100/withheld USD10, with an explicitly supplied 1.5 rate. Report shows gross AUD110, net AUD150, withheld AUD15; gross should be AUD165. [dividendGrossAud](/Users/sox/Desktop/SouthernStar/lib/reports/eofy/income.ts:5) and [income summary](/Users/sox/Desktop/SouthernStar/lib/storage/income.ts:58) read generic `grossDividend` as AUD although the [CSV importer](/Users/sox/Desktop/SouthernStar/lib/integrations/dividends.ts:224) retains it in source currency. The existing CSV importer itself does not supply foreign FX; this probe supplies it to isolate the gross-unit defect.
- Proposed correction: document and normalize each money field's currency per source, preserve original values/fee currency, and use a shared validated conversion boundary. Quantify source-specific historic corrections before backfill.

## F04 — High — Missing transaction FX silently becomes parity with AUD

**Type/status:** valuation correctness defect; reproduced.  
**Scope:** non-AUD rows without a valid conversion rate, potentially any personal/SMSF year.

- P02: USD100 buy and USD200 sale without FX produce cost AUD100 and gain AUD100 with an ordinary FIFO note. These AUD amounts cannot be known from the inputs.
- Cause: [audAmount](/Users/sox/Desktop/SouthernStar/lib/tax-lots.ts:175) uses `fxRateToBase || 1`; [transactionAud](/Users/sox/Desktop/SouthernStar/lib/reports/eofy/utils.ts:103) uses a null-to-1 fallback. A similar fallback exists in income summaries, and the Directshares All Trades FX helper returns 1 on missing data.
- Proposed correction: distinguish AUD=1 from unavailable/invalid foreign FX; show missing evidence and avoid definitive AUD/tax totals where incomplete. Keep executed, broker-base and inferred valuation rates separately identified.

## F05 — High — Discount eligibility is too early at the anniversary

**Type/status:** boundary correctness defect; reproduced against an official ATO worked example.  
**Scope:** parcels around the 12-month boundary; no production population measured.

- P05: acquisition 20 June 2025, disposal 19/20/21 June 2026 gives 364/365/366 days. Engine flags false/true/true. On the anniversary, a $100 gain becomes $50 taxable.
- [ATO's discount-method guidance](https://smallbusiness.taxsuperandyou.gov.au/capital-gains-tax/the-discount-method) excludes the acquisition and disposal days and expressly says the 20 June 2025–20 June 2026 example does not qualify. Expected anniversary taxable amount in this fixture is $100.
- Cause: [isDiscountEligible](/Users/sox/Desktop/SouthernStar/lib/tax-lots.ts:158) uses `heldDays >= 365`.
- Proposed correction: accountant-reviewed calendar rule plus leap-year and date-boundary tests. Do not simply substitute a universal day-count constant; confirm month/year edge cases. The earlier brief also requests accountant confirmation before changing this rule.

## F06 — High — Persisted PostgreSQL FX trades disappear from standard reads

**Type/status:** data-access defect for complete transaction/evidence coverage; established by code inspection, **not live SQL execution**.  
**Scope:** PostgreSQL FX rows; no actual production row counts verified.

- [importIbkr](/Users/sox/Desktop/SouthernStar/lib/storage/postgres.ts:108) leaves `instrument_id=null` for `type=FX` and inserts the transaction.
- [listTransactions](/Users/sox/Desktop/SouthernStar/lib/storage/postgres.ts:245) uses an inner join to instruments, necessarily excluding those rows. Evidence consumers using this adapter cannot see all persisted transactions.
- Proposed correction: an evidence projection or left join that preserves non-security events; keep tax-parcel filters in the parcel layer. Use a disposable PostgreSQL test for an FX row and a normal security row before rollout. Preserve pair identifiers and both currency legs.

## F07 — High — Importing a second IBKR account deactivates the first account's cash

**Type/status:** account-scoping defect; reproduced in local fixtures, matching PostgreSQL update found.  
**Scope:** two IBKR accounts within the same legal owner; this ownership/account combination was not verified in production.

- P09: import account A cash AUD100, then account B cash AUD200 for PERSONAL. Active cash becomes AUD200 instead of AUD300.
- Cause: [local cash upsert](/Users/sox/Desktop/SouthernStar/lib/storage/local.ts:135) deactivates every IBKR cash row for the owner; [PostgreSQL helper](/Users/sox/Desktop/SouthernStar/lib/storage/postgres/helpers.ts:251) does likewise for the portfolio. A one-account-per-file parser constraint does not guarantee one account per owner over successive imports.
- Proposed correction: deactivate only snapshots belonging to the importing stable account identity. Preserve inactive currency components' NAV convention. No NAV change should be made as part of evidence packaging; isolate and approve this existing-behavior fix separately.

## F08 — Medium — Original IBKR evidence and batch lineage are not retained consistently

**Type/status:** evidence coverage gap; raw loss reproduced in local mode, schema/file-storage limits inspected.  
**Scope:** local IBKR imports and all evidence exports requiring original files/batch history.

- P08 imports a raw-bearing row; the stored local row has no raw payload. [Local IBKR import](/Users/sox/Desktop/SouthernStar/lib/storage/local.ts:211) explicitly strips it. PostgreSQL retains transaction raw JSON, but import runs have no link from transactions or file hashes; local import summaries are overwritten.
- No immutable original XML/CSV/PDF store or supporting-document index was identified. A row payload is not a preserved unmodified source statement.
- Proposed correction: retain raw locally; add source-file/batch references and immutable private document storage on existing imports. Historical evidence remains missing unless original documents can establish it. Audit history must retain corrections rather than overwrite source facts.

## F09 — Medium — Same-ID corrections are silently treated as duplicates

**Type/status:** correction-policy gap; local behavior reproduced, equivalent PostgreSQL conflict policy inspected.  
**Scope:** source amendments retaining external IDs; production incidence unverified.

- P08 reimports a row with the same ID and amended cost 150 instead of 100. Import reports a duplicate and leaves 100 stored, with no change record or conflict exception. Ordinary exact reimport correctly imports zero rows.
- Cause: local dedup key existence check; PostgreSQL `ON CONFLICT ... DO NOTHING`. Local keys omit `source`, whereas the database unique index includes it, so adapter equivalence is also unverified.
- Proposed correction: distinguish byte/field-identical repeats from amended events, preserve versions and flag changed source facts. Map IBKR cancellation/reversal identifiers using real samples before choosing a correction policy.

## F10 — Medium — Historical open lots inherit today's holding quantities

**Type/status:** historical report inconsistency; reproduced.  
**Scope:** year-end unrealised schedules when holdings changed after year end.

- P13: buy two units for $100 in FY2026; sell one after 30 June. Current holding has one unit. EOFY historical row correctly says two units/$200 value, but the open-lot schedule says one unit and receives the entire $200 value. Its note flags a quantity mismatch, but the row's quantity and unit cost are not the true historical position.
- Cause: [buildEofyReport](/Users/sox/Desktop/SouthernStar/lib/reports/eofy.ts:47) truncates transactions but passes current holdings into `buildTaxLots`; [openLotsForHolding](/Users/sox/Desktop/SouthernStar/lib/tax-lots.ts:684) scales lots to current quantities; [year-end repricing](/Users/sox/Desktop/SouthernStar/lib/reports/eofy/cgt.ts:142) redistributes historic value over those current quantities. Fully sold current holdings can disappear from this lot schedule altogether.
- Proposed correction: build historical open-lot quantities from canonical transactions at the cutoff and separately retain clearly labeled current references. Missing history remains an exception, not an invented opening lot.

## F11 — Medium — Date ranges accept nonexistent calendar dates

**Type/status:** input-validation defect; reproduced.  
**Scope:** range endpoints used by tax-lot and tax-position APIs.

- P07: `from=2026-02-30&to=2026-06-30` is accepted. Expected invalid-date response before storage access.
- Cause: [reportPeriod](/Users/sox/Desktop/SouthernStar/lib/reports/report-period.ts:37) checks format and lexical ordering only. Existing tests cover malformed format/reversal but not real calendar validity.
- Proposed correction: validate calendar dates plus inclusive range semantics; define Australian-local versus original broker time boundaries without discarding original date strings/timezones.

## F12 — Medium — Tax settings and reports lack frozen historical versions

**Type/status:** reproducibility/evidence gap; schema/API/report construction inspected.  
**Scope:** rerunning historic personal/SMSF outputs after elections, pension state, prices or source rows change.

The user's confirmed current SMSF state is 100% pension phase. This finding concerns preserving historical settings and report evidence; it does not require partial-pension modeling for the current account. No historical effective date was supplied.

- Profiles store current book-wide pension and parcel settings, not effective periods or immutable disposal/report elections. [Profile API](/Users/sox/Desktop/SouthernStar/app/api/tax-profiles/route.ts:69) explicitly says reported gains on past disposals change with a new setting. Reports rebuild from current settings/data and a new generation timestamp.
- Two CSV builds with identical frozen in-memory inputs and generation time agree in the local probe. That establishes serializer repeatability only, not replayability of a historical report after data/settings change.
- Proposed correction: record report input/settings/source versions and hashes in the evidence manifest; preserve accountant-approved elections and treatment periods. Do not silently revise lodged years or infer partial/exempt treatment from a global flag.

## Coverage gaps distinct from defects

| ID / priority | Missing capability | Evidence and minimal proposal |
|---|---|---|
| G01 / High export blocker | IBKR cash activity ingestion | P06: 2 CashTransaction rows → 0 activity transactions while CashReport is accepted. Add required source sections to existing ingestion after inspecting actual query/sample fields; retain deposits, withdrawals, fees, interest and dividends with coverage counts. |
| G02 / High export blocker | Westpac/Macquarie transaction imports and transfer matching | Manual balance route exists; no bank transaction parser/match history found. Review real formats; add source-preserving imports and explicit unmatched/manual review. |
| G03 / High export blocker | Evidence package, original files, balances by year/currency | No Tax Evidence UI/ZIP/manifest/index/document archive. Reuse transactions, imports, CSV/XLSX and ZIP mechanisms; add only missing evidence fields and original-file storage. |
| G04 / Medium tax parity gap | Brought-forward losses, collectables, AMMA adjustments | Current-year general loss ordering exists; no separate carry-forward buckets or validated AMIT/ROC-to-cost-base flow. Treat as accountant-dependent parity scope, not evidence v1 tax classification. |
| G05 / Verification blocker | Live schema, original statements and matched historical expected reports | Local store is not established as production. No deployment/source-level accuracy assertion can pass without these inputs. |
| O01 / Low local tooling issue | Duplicate generated TypeScript declarations | Standard typecheck fails in `.next/types/* 2.ts`. Excluding three generated duplicates gives zero diagnostics. Cleanup/build regeneration requires a separate approved action; no source error demonstrated. |

Implementation remains gated by the user's audit-first brief. Review these IDs and the proposed sequence in [AUDIT_REPORT.md](AUDIT_REPORT.md) before approving changes.
