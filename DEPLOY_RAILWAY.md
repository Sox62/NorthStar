# Deploy North Star v0.3.1 to Railway

## Existing Railway installation

Replace the repository files with this release, commit and push. Railway will automatically:

1. run `npm run build`;
2. apply the new Drizzle migration, including the `manual_assets` table;
3. verify the Railway environment;
4. restart North Star;
5. check `/api/health`.

No database reset is required. Existing imports, cash accounts and snapshots remain in PostgreSQL.

## Required variables

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
NORTH_STAR_USERNAME=stephen
NORTH_STAR_PASSWORD=<a unique password of at least 16 characters>
SYNC_SECRET=<a different long random value>
HOSTNAME=0.0.0.0
```

Use Railway's **Add Reference Variable** control for `DATABASE_URL`. Do not add or replace Railway's supplied `PORT` variable.

## After deployment

1. Open `/imports` and import the latest IBKR Flex XML containing Open Positions and Cash Report.
2. Confirm that `IBKR Cash` appears automatically.
3. Remove any differently named temporary manual IBKR cash account if one was previously created.
4. Open `/assets` and enter personally owned physical platinum positions.

## New installation

Create a private GitHub repository, deploy it to Railway, add PostgreSQL, add the variables above, generate a Railway domain, then import broker files.
