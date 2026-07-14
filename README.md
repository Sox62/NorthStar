# North Star v0.2.1 — Railway-ready

*In Via Recta Celeriter*

A private portfolio system that preserves the legal separation between **Personal** and **SMSF** assets while providing a consolidated analytical view.

## What v0.2 does

- Saves validated IBKR Flex XML imports permanently.
- Saves Directshares holdings CSV imports permanently.
- Uses IBKR contract IDs rather than ticker alone, preventing collisions such as two different securities both using `EQTY`.
- Rebuilds open IBKR quantities and remaining FIFO cost basis from imported executions.
- Uses Directshares market value, daily movement and unrealised P&L directly from the holdings export.
- Adds Macquarie and other external cash balances, assigned to Personal or SMSF.
- Replaces dashboard demonstration values with imported data.
- Records snapshots whenever an import or cash balance is saved.
- Runs locally without database setup using `.north-star/data.json`.
- Automatically uses PostgreSQL when `DATABASE_URL` is configured.

## Important IBKR valuation note

The supplied IBKR report contains **Trades**, including FX executions, commissions, cost and FIFO realised P&L. It does not include a current **Open Positions** or **Cash Report** section. North Star therefore values open IBKR positions at remaining AUD cost basis and labels them **provisional**. It does not invent a current market value or cash balance.

A later Flex Query should add Open Positions, Cash Report, Cash Transactions, Dividends, Withholding Tax, Fees, Corporate Actions and Transfers.

## Run locally

```bash
npm install --no-audit --no-fund
npm run dev -- -p 3001 -H 127.0.0.1
```

Open:

- Dashboard: `http://127.0.0.1:3001`
- Broker imports: `http://127.0.0.1:3001/imports`
- Cash accounts: `http://127.0.0.1:3001/cash`

With no `DATABASE_URL`, saved data remains in:

```text
.north-star/data.json
```

That directory is excluded from Git.

## Updating from v0.1.1

Replace the project files with v0.2, then run:

```bash
rm -rf node_modules
npm install --no-audit --no-fund
npm run dev -- -p 3001 -H 127.0.0.1
```

## Railway + PostgreSQL

See `DEPLOY_RAILWAY.md`. This build adds fail-closed password protection, PostgreSQL health checks, a pre-deploy migration, and Railway environment validation.

The database schema is in `lib/db/schema.ts`; generated migrations are in `drizzle/`.

## Current limits

- Directshares CSV is a current holdings snapshot, not transaction history.
- IBKR market values remain provisional until Open Positions or live market prices are added.
- IBKR current cash requires Cash Report or a manual cash balance.
- Market and FX automation still require a provider.
- Authentication is not yet enabled; do not expose a local development server publicly.

## Security

Do not commit broker files, banking credentials, Flex tokens or API keys. Store production secrets only in Railway environment variables.
