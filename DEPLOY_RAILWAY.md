# Deploy North Star to Railway

North Star should be deployed as a separate Railway project from Raisonné.

## Services

- North Star web service
- PostgreSQL database

## 1. Put the project in a private GitHub repository

Create a private repository named `north-star`, copy this folder's contents into it, then commit and push.

## 2. Create the Railway project

In Railway, create a new project and select **Deploy from GitHub repo**. Select the private `north-star` repository.

## 3. Add PostgreSQL

On the project canvas choose **+ New → Database → PostgreSQL**.

## 4. Add web-service variables

In the North Star web service, open **Variables** and add:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
NORTH_STAR_USERNAME=stephen
NORTH_STAR_PASSWORD=<a unique password of at least 16 characters>
SYNC_SECRET=<a different long random value>
```

Use Railway's **Add Reference Variable** control for `DATABASE_URL` where possible. The database service may be named something other than `Postgres`; select its `DATABASE_URL` variable in the UI.

Do not add IBKR credentials until the automated Flex sync is enabled.

## 5. Deploy

Railway reads `railway.json` and will:

1. run `npm run build`;
2. run the Drizzle migration as a pre-deploy command;
3. verify that database and authentication variables exist;
4. start Next.js;
5. check `/api/health`.

## 6. Generate the HTTPS domain

Open the web service's **Settings → Networking** and choose **Generate Domain**.

The first visit will show a browser username/password prompt. Use the values set in `NORTH_STAR_USERNAME` and `NORTH_STAR_PASSWORD`.

## 7. Import data

Open `/imports` on the Railway domain and save:

- IBKR Flex XML into SMSF;
- Directshares CSV into Personal.

Add Macquarie balances under `/cash`.

## Notes

- Railway Postgres is the durable source of truth. The local `.north-star/data.json` file is not uploaded.
- Keep the GitHub repository private.
- Railway cron automation is not enabled in this release; new broker files remain manual imports.
