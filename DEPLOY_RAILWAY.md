# Deploy NorthStar v0.3.4 to Railway

## Existing Railway installation

Replace the repository files with this release, commit and push. Railway will automatically:

1. run `npm run build`;
2. apply migration `0002_abc_platinum_and_flex`;
3. preserve existing PostgreSQL data;
4. convert any v0.3.1 platinum entries from troy ounces to kilograms;
5. restart NorthStar and check `/api/health`.

No database reset is required.

## Variables

Keep the existing variables and confirm these are present:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
NORTH_STAR_USERNAME=stephen
NORTH_STAR_PASSWORD=<private password>
SYNC_SECRET=<different private value>
HOSTNAME=0.0.0.0
IBKR_FLEX_TOKEN=<private token>
IBKR_FLEX_QUERY_ID=<query ID>
IBKR_FLEX_OWNER=SMSF
```

Do not add or replace Railway’s supplied `PORT` variable.

## After deployment

1. Open **Broker imports**.
2. Press **Sync IBKR now**.
3. Confirm Open Positions and `IBKR Cash` update.
4. Open **Physical platinum**.
5. Confirm the ABC Bullion buyback price loads.
6. Add each Personal platinum position using kilograms and actual total purchase cost.

If a temporary manually entered IBKR cash account has a different name, remove it after confirming the automatic `IBKR Cash` balance, to avoid double-counting.

## Optional scheduled sync

The included worker command is:

```text
npm run worker
```

It refreshes IBKR and ABC Bullion once per run. It can be attached to a separate Railway Cron service later. The protected HTTP endpoint `/api/sync` can also be called with the `x-sync-key` header set to `SYNC_SECRET`.
