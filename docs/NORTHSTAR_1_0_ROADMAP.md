# NorthStar 1.0 Roadmap

NorthStar 1.0 is a private portfolio operating system for Personal and SMSF wealth. The implementation should stay modular, but remain a single deployable Next.js application until there is a clear operational reason to split services.

## Current Baseline

- Next.js App Router and TypeScript are deployed on Railway.
- PostgreSQL is the production store.
- The screenshot-style dashboard is live as the primary overview.
- IBKR Flex sync works manually and is scheduled by the Railway web process.
- ABC Bullion platinum pricing is integrated for physical platinum.
- Personal and SMSF ownership are represented separately in storage and dashboard queries.

## Phase 1 - Foundation

Goal: make the current product stable enough for daily use and future expansion.

Deliverables:

- Keep Railway production as the stable environment.
- Keep GitHub `main` as source of truth with small, reviewable commits.
- Preserve Basic Auth until passkeys are implemented.
- Add passkey/WebAuthn authentication after the portfolio core is stable.
- Add operational status surfaces for sync, valuation freshness and roadmap progress.
- Add backup/runbook documentation for PostgreSQL and deployment recovery.

Acceptance:

- A non-technical user can see whether data is fresh.
- A developer can safely ship small changes without ZIP-file ambiguity.
- Production can be recovered from documented variables and database backup.

## Phase 2 - Portfolio Core

Goal: make the portfolio engine the trusted source of truth.

Deliverables:

- Accounts: Personal, SMSF, then Family and Trust when required.
- Assets: shares, ETFs, cash, platinum, silver, gold, rhodium, palladium, and future options/property/crypto.
- Transaction ledger as immutable history.
- Current positions as replaceable broker snapshots.
- Daily portfolio snapshots for NAV history.
- Consistent asset classification and commodity exposure mapping.

Acceptance:

- Dashboard totals reconcile to position, cash and bullion records.
- Personal and SMSF data can be queried separately or consolidated.
- Broker snapshot imports can replace current positions without corrupting transaction history.

## Phase 3 - Automation

Goal: reduce manual data handling.

Deliverables:

- IBKR Flex automatic daily sync and manual "Sync Now".
- Sharesight API sync where credentials and API access are available.
- Directshares integration by API if available, otherwise Sharesight or contract-note parsing.
- Broker sync run history and error visibility.
- Cash refresh integrations for Macquarie and external accounts where APIs are available.

Acceptance:

- Morning portfolio view is current without manual action.
- Failed syncs are visible and actionable.
- Manual file import remains available as a fallback.

## Phase 4 - Pricing

Goal: make valuation transparent and repeatable.

Deliverables:

- ASX, NYSE and TSX end-of-day pricing.
- Metals pricing and dealer buyback pricing.
- FX rates to AUD.
- ABC Bullion buyback for physical platinum.
- Price-source audit trail.

Acceptance:

- Every valuation has a source, timestamp and basis.
- Missing prices are visible rather than silently stale.
- Current positions can distinguish market value from cost-basis fallback.

## Phase 5 - Analytics

Goal: turn holdings data into decision-quality reporting.

Deliverables:

- NAV history.
- Daily, monthly, YTD and since-inception return.
- XIRR.
- Allocation drift.
- Commodity exposure.
- Currency exposure.
- CGT, dividends and tax-position tracking.

Acceptance:

- The dashboard explains where return came from.
- Allocation and exposure can be viewed by account and consolidated.
- Tax and dividend data can feed reports without manual spreadsheet reconstruction.

## Phase 6 - Reports

Goal: make repeatable reporting a one-click workflow.

Deliverables:

- SMSF report.
- Personal report.
- Tax report.
- Estate summary.
- Wealth statement.
- Exportable PDF/CSV packages.

Acceptance:

- Reports can be regenerated from stored data.
- Report outputs are dated, scoped and tied to the valuation snapshot used.
- SMSF and Personal outputs stay legally separated.

## Architecture Direction

NorthStar should evolve as a modular monolith first:

- `lib/storage`: persistence adapters.
- `lib/integrations`: broker and price feeds.
- `lib/roadmap`: delivery plan and status metadata.
- Future `lib/core`: portfolio accounting, valuations, analytics and reporting.

Split NorthStar Core and NorthStar UI into separate packages only after the core contracts are stable and shared outside the web app.
