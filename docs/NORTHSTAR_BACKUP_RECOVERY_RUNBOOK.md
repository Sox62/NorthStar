# NorthStar Backup and Recovery Runbook

NorthStar production depends on two recoverable assets:

- GitHub `main` for source and deploy history.
- PostgreSQL data behind `DATABASE_URL` for portfolio records, positions, cash, snapshots, sync runs and prices.

Railway deployment settings and secrets are operational configuration. Keep a separate private record of required environment variable names and where each value is stored.

## Recovery Targets

- Source rollback: redeploy a known good Git commit.
- Database recovery: restore the most recent verified PostgreSQL dump.
- Data loss target: no more than one business day once scheduled backups are in place.
- Restore confidence: every backup must be tested against a non-production database before it is trusted.

## Routine Backup

Run before risky migrations, bulk imports, pricing changes or sync-engine changes:

```sh
mkdir -p backups
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file "backups/northstar-$(date +%Y%m%d-%H%M%S).dump"
```

Create a quick schema-readable copy when debugging:

```sh
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-acl --file "backups/northstar-schema-$(date +%Y%m%d-%H%M%S).sql"
```

Store production dumps outside the repo. Do not commit `.dump`, `.sql` or exported CSV files containing portfolio data.

## Restore Drill

Test a dump against a non-production database:

```sh
createdb northstar_restore_check
pg_restore --clean --if-exists --no-owner --no-acl --dbname northstar_restore_check backups/northstar-YYYYMMDD-HHMMSS.dump
DATABASE_URL="postgres://localhost/northstar_restore_check" npm run build
DATABASE_URL="postgres://localhost/northstar_restore_check" node scripts/migrate.mjs
```

Then start the app against the restored database and verify:

```sh
DATABASE_URL="postgres://localhost/northstar_restore_check" npm run dev
```

Check these URLs:

- `/api/health`
- `/api/dashboard?scope=overall`
- `/api/dashboard?scope=personal`
- `/api/dashboard?scope=smsf`
- `/api/reports/wealth-statement?scope=overall`

## Production Restore

Only restore production after confirming the target dump and commit.

1. Pause scheduled syncs if possible, or avoid restoring during the morning sync window.
2. Take a final pre-restore dump of the current production database.
3. Restore the chosen dump to production PostgreSQL:

```sh
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$DATABASE_URL" backups/northstar-YYYYMMDD-HHMMSS.dump
```

4. Run migrations from the commit that will be deployed:

```sh
npm run build
node scripts/migrate.mjs
```

5. Deploy or redeploy the intended Git commit.
6. Verify `/api/health`, dashboard scopes, latest sync status and the wealth statement export.

## Application Rollback

If code deploys badly but the database is valid:

1. Identify the last good commit:

```sh
git log --oneline --decorate -n 20
```

2. Revert the bad change with a new commit rather than rewriting history:

```sh
git revert <bad_commit_sha>
git push origin main
```

3. Wait for Railway to redeploy from `main`.
4. Verify `/api/health` and the affected dashboard workflow.

## Migration Safety

Before adding or changing a migration:

- Confirm the migration is forward-only and can run on existing production data.
- Take a fresh production dump.
- Run `npm run build`.
- Run `node scripts/migrate.mjs` against a restored non-production copy.
- Confirm dashboard and report APIs still return valid data.

## Post-Restore Verification Checklist

- Health endpoint returns `ok: true`.
- Overall, Personal and SMSF dashboards load.
- NAV, cash and position counts are plausible.
- Freshness checks show expected valuation dates.
- Wealth statement CSV downloads and includes the expected scope.
- Manual IBKR sync can run without corrupting positions.
- Railway logs show no repeated runtime errors after restart.

## Cadence

- Before every migration or bulk import: manual dump.
- Weekly: restore the latest backup into a non-production database and run the verification checklist.
- Monthly: review environment variables and confirm required secrets still exist in the hosting environment.
