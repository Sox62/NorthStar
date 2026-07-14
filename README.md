# NorthStar v0.3.4 — Railway-ready

*In Via Recta Celeriter*

A private portfolio system that preserves the legal separation between **Personal** and **SMSF** assets while providing a consolidated analytical view.

## What v0.3.4 adds

- Fixes platinum saves when a cached PostgreSQL timestamp is returned in database format instead of strict ISO-8601.

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

## Local development

```bash
npm install --no-audit --no-fund
npm run dev -- -p 3001 -H 127.0.0.1
```

With no `DATABASE_URL`, data is stored in `.north-star/data.json`.

## Security

Do not commit broker files, banking credentials, Flex tokens or API keys. Store production secrets only in Railway environment variables.
