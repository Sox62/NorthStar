# FX and tax evidence recording — first implementation

15 October 2026. The user authorized implementation after reviewing the audit/remediation work: “Make note of that and start working on recording and presenting the FX transactions regarding Tax reporting stuff we spoke about earlier.”

**Source clarification:** IBKR is supplied directly through the existing Flex Web Service API. The user has no IBKR files to upload. The application retains the returned XML internally as original evidence; an IBKR file from the user is not a prerequisite. Westpac/Macquarie statements and artwork documents use the separate upload workflow.

**Westpac timing:** The user will produce the Westpac statements later and has not done so yet. This does not block recording IBKR-side conversions, deposits or withdrawals from Flex. Westpac evidence will corroborate the bank side and support transfer matching when available; it is not a prerequisite for IBKR ingestion. Do not assume a query includes all currency trades or the full required history merely because a sync succeeds.

## Remaining audit items retained

- The `/tax` workbench still needs its existing missing-FX warning displayed. This change adds an evidence report with its own completeness checks; it does not close that separate workbench item.
- The remediation narrative's printed reconciliation bridge differs by 2 cents and its holding components by 9 cents. Preserve the need for an explicit rounding bridge.
- F05 remains subject to accountant confirmation. Existing parcel elections and discount eligibility are unchanged.
- Source amendments are reported, not automatically applied. Broker cancellation/reversal policy and a complete versioned correction workflow remain open.
- The SMSF is **100% pension phase**, as confirmed by the user. This report keeps it separate from Personal and does not calculate Division 775 or artwork tax, or assign tax treatment to transfers.

## What is implemented

`/reports/tax-evidence` selects exactly one legal owner and an Australian financial year. It presents original-currency activity, both FX conversion legs with execution rates/fee currency, cash roll-forwards, possible and confirmed transfers, exceptions, original documents and source checksums. It is linked from Reports.

- Existing IBKR Flex ingestion now retains Cash Transactions as `CASH_ACTIVITY` in the existing transaction table. This preserves deposits, withdrawals, fees, dividend/interest cash entries and source categories without feeding new classifications into portfolio income or tax calculations. Existing BUY/SELL/FX rows remain on the same pipeline. Account ownership is explicit; a multi-account statement is rejected as before.
- Regular direct Flex API sync automatically retains the Activity/Trade Confirmation responses privately, with SHA-256, retrieval method/time and statement coverage/sections. The tax evidence screen includes **Refresh IBKR evidence**, reusing the configured owner-specific Flex API connection. No IBKR upload is offered on that screen. Currency Cash Report starting/ending balances are evidence snapshots rather than portfolio values inferred from transactions.
- Westpac/Macquarie CSV imports use explicit owner, account and currency. Supported headers include Date/Transaction Date, Description/Details, signed Amount or Debit/Credit, optional Transaction ID, Reference, Currency and Balance. Original headers/rows and bytes are retained. ISO and Australian DD/MM/YYYY dates are accepted. Account/currency and coverage dates are explicitly declared on import.
- Generic bank Reference text is not assumed to be a globally unique transaction ID. True IDs deduplicate by owner/account/source; otherwise conservative composites or file-row identity preserve ambiguous events and flag overlap review. Exact file reimports are idempotent. No bank PDF transaction extraction is claimed; PDF artwork/source attachments can be retained for accountant review.
- Imports and direct IBKR refresh from the tax evidence screen retain transactions and original responses/documents without refreshing positions, cash-account balances, open orders or valuation/NAV snapshots. The direct refresh uses `/api/sync/ibkr?owner=PERSONAL|SMSF&mode=evidence` and the existing transaction importer. Regular broker sync retains its existing snapshot behavior and captures the same evidence automatically. Newly recorded historical transactions can still affect transaction-based analytics and tax reports.
- The configured Flex query determines the returned date range and sections; selecting a financial year filters saved evidence and does not change the remote query. A refresh reports its actual coverage and counts of FX, cash and security transactions. Missing Cash Transactions or currency Cash Report balances remain exceptions; no credentials or query settings are changed by the refresh.
- Activity responses missing Trades, Cash Transactions or Cash Report are explicitly flagged. Empty returned sections remain distinct from omitted sections. Supplemental Trade Confirmation responses are not expected to contain Activity cash sections. The presence of Trades alone does not prove the query includes every asset category or the full history; live configuration and totals still need verification. This local checkout has no configured Flex credentials, so this implementation has not verified the deployed query's actual coverage.
- Artwork contracts, invoices, settlement/commission and provenance documents can be attached as source files (PDF/TXT/CSV/XML), without inventing sale transactions or deciding CGT treatment.
- Transfer candidates use the same owner/currency/amount and a seven-day window and remain unconfirmed. Users can confirm, undo or manually pair records with fee/timing differences. Each action retains author/time/note; one cash record cannot have two active matches. No same-currency transfer is labeled tax-free.
- The ZIP contains the six requested CSV schedules, original supporting files, a source index, manifest and input checksum, report JSON, canonical transaction snapshot and review history. Original-file hashes are checked before packaging; another owner's file cannot enter the archive. CSV formula-leading text is escaped. Sensitive originals are delivered as attachments through authenticated application routes, not public URLs.

## Storage and deployment

Migration **`0036_tax_evidence.sql`** adds source-file metadata/content and append-only transfer review history. Financial events continue to live in `transactions`; no parallel transaction ledger or tax engine was added. Source IDs are owner/system/account/content hashes. Source bytes are stored in PostgreSQL alongside existing private application data, or in the existing local JSON store. The local `.southern-star` directory is now ignored by Git as `.north-star` already was.

Files are retained until a future explicit retention/deletion policy is implemented. Normal application authentication protects the routes. This does not assert storage-provider encryption, backup policy or access rights beyond the existing deployment; those operational controls still need verification. Large source sets may warrant private object storage later. A single manual upload is limited to 10 MB.

Run the existing migration command as part of an approved deployment **before enabling the updated importer on PostgreSQL**. This implementation has not run migrations or imports against production, deployed code, or altered live settings. Do not use mutating API calls as deployment/liveness probes.

The old database settings schema/model drift identified by the audit is not silently repaired here; the new source/review schema and migration are included explicitly. PostgreSQL source files/reviews must be included in normal database backups.

## Evidence limits

- Live IBKR query coverage and production figures have not been verified; IBKR evidence must be obtained from its configured Flex API rather than requested from the user as files. Real Westpac/Macquarie sample statements were not available during implementation, so their actual export formats and completeness remain unverified. Unsupported/ambiguous CSV layouts are rejected or remain exceptions; no sample dates/amounts are hardcoded in product behavior.
- Historical rows without a retained original API response or bank/document source remain “Missing evidence.” Identical API refreshes/reimports may add source references while preserving existing monetary/source facts; changed source facts remain conflicts.
- An executed rate is derived only from source execution quantity/price/proceeds. Missing conversion legs are exceptions, not guessed from a valuation FX rate. Original broker calendar dates are preserved; missing source timezones are named and no UTC-to-Australian tax-date interpretation is invented.
- Opening/closing cash requires source balances at the selected year's boundaries. Bank balances are explicitly labeled as declared on import; unknown balances are blank/exceptional. Arithmetic agreement alone does not establish complete coverage. Conflicting balances, missing cash amounts and unmatched events require review.
- The ZIP is a generated evidence snapshot with a version/input fingerprint, not a centrally frozen lodged return or an effective-dated tax-election register. Complete F12 policy/work remains separate.
- Screens show up to 200 transaction rows and 100 exceptions for readability; downloads contain all selected rows. Original supporting files and canonical snapshots contain unredacted records for the chosen owner; the page declares this before download.

## Validation

Final verification on 15 October 2026: **436/436 tests pass**, `npm run build` passes (including TypeScript and standalone packaging), and `git diff --check` passes. The real legacy portfolio file's SHA-256 remains unchanged. Browser visual verification could not be completed because the available browser blocked the local preview; API and export behavior were exercised directly with synthetic fixtures.

The new tests use synthetic documents/amounts and a pre-seeded disposable local store; they never fall back to the real legacy portfolio file. They cover cash-only deposits, both currency legs, partial conversions and residual USD, exact reimports, owner isolation, source checksums/ZIP contents, transfer confirmation/undo history, amendments without overwrites, missing evidence, omitted versus empty Flex sections, supplemental Trade Confirmation sections, invalid dates and preview/read endpoint behavior.

A mocked PostgreSQL client checks atomic source+transaction insertion, rollback on failure and absence of position/cash/order/snapshot writes for bank and IBKR evidence imports. A local-store regression exercises the direct Flex API refresh through the route with synthetic SendRequest/GetStatement responses, verifies owner isolation and exact repeat handling, retains the original response, and preserves existing valuations. This is **not** a live IBKR or PostgreSQL integration test. A disposable PostgreSQL deployment and reconciliation against the live Flex response and actual bank statements remain required before production rollout.

Official field references used: [IBKR Cash Transactions](https://www.ibkrguides.com/reportingreference/reportguide/cash%20transactionsfq.htm), [IBKR Cash Report](https://www.ibkrguides.com/reportingreference/reportguide/cash%20reportfq.htm), and [IBKR Flex Query reference](https://www.ibkrguides.com/reportingreference/reportguide/activity%20flex%20query%20reference.htm). These support source-field coverage, not Australian tax conclusions.
