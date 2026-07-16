# NorthStar v0.3.7 — Railway-ready

*In Via Recta Celeriter*

A private portfolio system that preserves the legal separation between **Personal** and **SMSF** assets while providing a consolidated analytical view.

## What v0.3.7 adds

- Rebuilds the interface around the uploaded `templates/nextjs-handoff` design package rather than retaining the previous five-card dashboard structure.
- Adds a new branded masthead, integrated portfolio-value hero, embedded KPI matrix, allocation panel, redesigned holdings register and account-source panel.
- Applies the same visual language to broker imports, cash accounts and physical platinum pages.
- Uses the supplied semantic tokens and reusable cards, KPI, status, split-bar, breakdown-bar, navigation and notice components.
- Improves responsive layouts, focus states and mobile/PWA presentation without changing stored portfolio data.
- Fixes the PostgreSQL platinum INSERT statement that caused `INSERT has more expressions than target columns`.
- Adds installable PWA support for iPhone, iPad, Android, Mac and desktop browsers.
- Adds NorthStar app icons, standalone display mode and an install button where supported.
- Keeps portfolio pages and API data network-only; sensitive balances and holdings are not cached for offline viewing.

- Activates the **IBKR Flex Web Service** using `IBKR_FLEX_TOKEN` and `IBKR_FLEX_QUERY_ID` stored privately in Railway.
- Adds a **Sync IBKR now** button that downloads the saved Flex Query and updates trades, Open Positions and IBKR cash.
- Continues to deduplicate trades using IBKR transaction IDs.
- Records physical platinum in **kilograms**, defaulting to Personal ownership.
- Retrieves the current **ABC Bullion 1 kg platinum tablet buyback price** for realisable valuation.
- Displays ABC’s retail price and current retail-to-buyback spread separately from the investor’s actual return.
- Revalues all saved platinum positions whenever the ABC price is refreshed.
- Saves one ABC platinum price record per day for future history.
- Adds a protected `/api/sync` endpoint and updated worker for scheduled IBKR and platinum refreshes.

## Railway variables

Required:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
NORTH_STAR_USERNAME=stephen
NORTH_STAR_PASSWORD=<unique password of at least 16 characters>
NORTH_STAR_SESSION_SECRET=<different long random value for signed login cookies>
SYNC_SECRET=<different long random value>
HOSTNAME=0.0.0.0
```

IBKR automation:

```text
IBKR_FLEX_TOKEN=<private Flex Web Service token>
IBKR_FLEX_QUERY_ID=<IBKR NS query ID>
IBKR_FLEX_OWNER=SMSF
```

Do not commit or share the token.

## Passkey login

NorthStar uses passkeys for normal sign-in. Open `/login`, enter the existing `NORTH_STAR_USERNAME` and `NORTH_STAR_PASSWORD` once, then create a passkey with Face ID, Touch ID, Windows Hello or a hardware security key.

Basic Auth remains available as a rollout and recovery fallback while passkeys are being proven in production.

## IBKR query contents

The saved Flex Query should contain:

- Cash Report
- Open Positions
- Trades

NorthStar uses Open Positions as the authoritative holdings snapshot and `CashReport → BASE_SUMMARY → endingCash` as the IBKR cash balance.

## Platinum valuation

The platinum page stores quantity in kilograms, purchase date and actual total AUD cost. Current value is:

```text
quantity in kg × ABC Bullion 1 kg platinum tablet buyback price
```

Investment return is measured against actual purchase cost. ABC’s current retail-to-buyback spread is shown separately and is not treated as the investment return.

The ABC price is refreshed when the platinum page opens, when **Refresh ABC price** is pressed, and through the scheduled sync worker/endpoint.

## Scheduled sync

Railway starts NorthStar with `npm run start:railway`, which schedules an automatic local call to:

```text
/api/sync
```

The default schedule is `20:30 UTC`, which is 06:30 Sydney during AEST and 07:30 during AEDT. It refreshes IBKR Flex, ABC Bullion platinum and portfolio snapshots.

Required Railway variables:

```text
SYNC_SECRET=<different long random value>
IBKR_FLEX_TOKEN=<private Flex Web Service token>
IBKR_FLEX_QUERY_ID=<IBKR NS query ID>
IBKR_FLEX_OWNER=SMSF
```

Optional overrides:

```text
NORTHSTAR_AUTO_SYNC=false
NORTHSTAR_AUTO_SYNC_HOUR_UTC=20
NORTHSTAR_AUTO_SYNC_MINUTE_UTC=30
```

## PWA installation

NorthStar can be installed from its Railway URL. On Chrome or Edge, use the **Install NorthStar** link when it appears. On iPhone or iPad, open NorthStar in Safari, use **Share**, then choose **Add to Home Screen**. On Safari for Mac, use **File → Add to Dock**.

The PWA requires an internet connection for portfolio data. The service worker caches only static application files and a generic offline page; it does not cache API responses, holdings, balances or transactions.

## Local development

```bash
npm install --no-audit --no-fund
npm run dev -- -p 3001 -H 127.0.0.1
```

With no `DATABASE_URL`, data is stored in `.north-star/data.json`.

## Security

Do not commit broker files, banking credentials, Flex tokens or API keys. Store production secrets only in Railway environment variables.
