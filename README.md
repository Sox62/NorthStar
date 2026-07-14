# North Star v0.3.1 — Railway-ready

*In Via Recta Celeriter*

A private portfolio system that preserves the legal separation between **Personal** and **SMSF** assets while providing a consolidated analytical view.

## What v0.3.1 adds

- Imports authoritative IBKR **Open Positions** market values, quantities, cost bases and unrealised P&L.
- Imports IBKR **Cash Report** ending cash into an `IBKR Cash` account without double-counting a prior manual entry.
- Continues to preserve and deduplicate IBKR trades using transaction IDs.
- Adds a **Physical platinum** page for manually entered positions.
- Physical platinum defaults to **Personal** ownership and appears in the Personal and Overall dashboards.
- Records quantity in troy ounces, total AUD purchase cost, current AUD value, unrealised P&L and valuation date.
- Supports editing and deleting physical platinum positions.
- Keeps Trades-only IBKR reports as provisional cost-basis valuations when Open Positions is absent.

## Run locally

```bash
npm install --no-audit --no-fund
npm run dev -- -p 3001 -H 127.0.0.1
```

Open:

- Dashboard: `http://127.0.0.1:3001`
- Broker imports: `http://127.0.0.1:3001/imports`
- Cash accounts: `http://127.0.0.1:3001/cash`
- Physical platinum: `http://127.0.0.1:3001/assets`

With no `DATABASE_URL`, saved data remains in `.north-star/data.json`.

## Railway + PostgreSQL

See `DEPLOY_RAILWAY.md`. The pre-deploy migration creates the new `manual_assets` table automatically.

## IBKR file requirements

The preferred Flex Query contains:

- Cash Report
- Open Positions
- Trades

North Star uses Open Positions as the authoritative current holdings snapshot and `CashReport → BASE_SUMMARY → endingCash` as the IBKR cash balance.

## Physical platinum pricing

Version 0.3.1 uses a manually entered current AUD price per troy ounce. Automatic platinum spot-price retrieval can be added later without changing the saved position structure.

## Security

Do not commit broker files, banking credentials, Flex tokens or API keys. Store production secrets only in Railway environment variables.
