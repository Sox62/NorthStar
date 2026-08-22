# SouthernStar v0.3.7 — Railway-ready

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
- Adds SouthernStar app icons, standalone display mode and an install button where supported.
- Keeps portfolio pages and API data network-only; sensitive balances and holdings are not cached for offline viewing.

- Activates the **IBKR Flex Web Service** using `IBKR_FLEX_TOKEN` and `IBKR_FLEX_QUERY_ID` stored privately in Railway.
- Adds a **Sync IBKR now** button that downloads the saved Flex Query and updates trades, Open Positions and IBKR cash.
- Continues to deduplicate trades using IBKR transaction IDs.
- Adds **Directshares contract-note imports** from bulk confirmation CSV, PDF upload or an IMAP mailbox/label fed by broker confirmation emails.
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

To sync both legal books from IBKR at the same time, keep `IBKR_FLEX_TOKEN` as the shared token and add owner-specific query IDs:

```text
IBKR_SMSF_FLEX_QUERY_ID=<SMSF Flex Query ID>
IBKR_PERSONAL_FLEX_QUERY_ID=<Personal Flex Query ID>
```

If either book needs a separate token, set `IBKR_SMSF_FLEX_TOKEN` or `IBKR_PERSONAL_FLEX_TOKEN`; otherwise SouthernStar reuses `IBKR_FLEX_TOKEN`. The legacy `IBKR_FLEX_QUERY_ID` still works and can remain as the SMSF query while you add `IBKR_PERSONAL_FLEX_QUERY_ID`.

Do not commit or share the token.

Read-only IBKR open orders:

```text
IBKR_CP_BASE_URL=https://localhost:5000/v1/api
IBKR_CP_ACCOUNT_ID=<IBKR account id>
IBKR_CP_ORDER_FILTERS=submitted,pre_submitted,pending_submit,inactive
```

Open orders use IBKR Client Portal/Web API, not the Flex report. The gateway or OAuth session must already be authenticated and reachable from the SouthernStar server. On Railway, `localhost` means the Railway container, not your Mac, so production needs a reachable gateway/OAuth setup before the Overview open-orders card can show live working orders.

Directshares email automation:

```text
DIRECTSHARES_EMAIL_HOST=imap.gmail.com
DIRECTSHARES_EMAIL_PORT=993
DIRECTSHARES_EMAIL_SECURE=true
DIRECTSHARES_EMAIL_USER=<mailbox user>
DIRECTSHARES_EMAIL_PASSWORD=<mailbox app password>
DIRECTSHARES_EMAIL_MAILBOX=INBOX
DIRECTSHARES_EMAIL_OWNER=PERSONAL
DIRECTSHARES_EMAIL_LOOKBACK_DAYS=45
```

If your mail rule labels confirmations for SouthernStar, set `DIRECTSHARES_EMAIL_MAILBOX` to that IMAP mailbox/label. The sync filters for `service@directshares.com.au` and trade-confirmation subjects, parses attached `.PDF` files and deduplicates by Directshares confirmation number. Manual imports also accept the Directshares bulk confirmation CSV and group rows by account number before saving.

Directshares dividend notices can use the same mailbox credentials or their own label/app password:

```text
DIRECTSHARES_DIVIDEND_EMAIL_MAILBOX=INBOX
DIRECTSHARES_DIVIDEND_EMAIL_OWNER=PERSONAL
DIRECTSHARES_DIVIDEND_EMAIL_SUBJECT=Dividend
DIRECTSHARES_DIVIDEND_EMAIL_LOOKBACK_DAYS=90
DIRECTSHARES_DIVIDEND_EMAIL_MAX_MESSAGES=50
```

Set `DIRECTSHARES_DIVIDEND_EMAIL_HOST`, `DIRECTSHARES_DIVIDEND_EMAIL_USER` and `DIRECTSHARES_DIVIDEND_EMAIL_PASSWORD` only if the dividend rule lands in a different mailbox. Otherwise SouthernStar reuses the `DIRECTSHARES_EMAIL_*` connection settings. A Sharesight feed can be added later as a reconciliation source, but broker confirmations and dividend notices remain the auditable first-source records.

Market data quote refresh:

```text
EODHD_API_TOKEN=<private EODHD API token>
```

`MARKETDATA_EODHD_API_TOKEN` is also accepted. EODHD is preferred for production. In `auto` mode SouthernStar falls back to known fund NAV sources, Yahoo Finance delayed chart data and then Stooq, so scheduled pricing will attempt a no-token refresh when EODHD is absent. Yahoo can rate-limit server environments and Stooq may require browser verification, so both are fallback sources rather than the primary production feed.

`ETPMAG` is treated as a known Global X physical silver ETP. If broker/Yahoo quotes are unavailable, SouthernStar can price it from the Global X fund NAV/unit page and records the source as `Global X NAV per unit`.

Provider symbol overrides are comma-separated `SYMBOL:EXCHANGE=PROVIDER_SYMBOL` pairs:

```text
MARKETDATA_EODHD_SYMBOL_OVERRIDES=SVM:TSX/TSXV=SVM.TO
MARKETDATA_YAHOO_SYMBOL_OVERRIDES=SVM:TSX/TSXV=SVM.TO
```

`MARKETDATA_SYMBOL_OVERRIDES` remains supported as the legacy EODHD override variable.

## Passkey login

SouthernStar uses passkeys for normal sign-in. Open `/login`, enter the existing `NORTH_STAR_USERNAME` and `NORTH_STAR_PASSWORD` once, then create a passkey with Face ID, Touch ID, Windows Hello or a hardware security key.

Password login remains available as the recovery path if a device passkey is lost. Legacy HTTP Basic Auth is disabled by default; set `NORTH_STAR_ALLOW_BASIC_AUTH=true` only if you need that older access path during an emergency rollback.

## IBKR query contents

The saved Flex Query should contain:

- Cash Report
- Open Positions
- Trades

SouthernStar uses Open Positions as the authoritative holdings snapshot and `CashReport → BASE_SUMMARY → endingCash` as the IBKR cash balance.

IBKR open orders are read-only and use Client Portal/Web API `GET /iserver/account/orders`. They are displayed separately from trades because unfilled orders are not positions and should not affect NAV, P/L or cash until executed.

For two IBKR legal books, create one Activity Flex Query for SMSF and one Activity Flex Query for Personal with the same Cash Report, Open Positions and Trades sections, then store their query IDs in `IBKR_SMSF_FLEX_QUERY_ID` and `IBKR_PERSONAL_FLEX_QUERY_ID`.

## Platinum valuation

The platinum page stores quantity in kilograms, purchase date and actual total AUD cost. Current value is:

```text
quantity in kg × ABC Bullion 1 kg platinum tablet buyback price
```

Investment return is measured against actual purchase cost. ABC’s current retail-to-buyback spread is shown separately and is not treated as the investment return.

The ABC price is refreshed when the platinum page opens, when **Refresh ABC price** is pressed, and through the scheduled sync worker/endpoint.

## Scheduled sync

Railway starts SouthernStar with `npm run start:railway`, which schedules an automatic local call to:

```text
/api/sync
```

The default schedule is `20:30 UTC`, which is 06:30 Sydney during AEST and 07:30 during AEDT. It refreshes IBKR Flex, Directshares confirmation email, Directshares dividend email, delayed market quotes, ABC Bullion platinum and portfolio snapshots. Railway also runs one full sync shortly after each process start, so a deploy/restart does not leave the app waiting until the next daily run.

Intraday pricing is a lightweight market-data-only refresh. It is enabled by default, runs shortly after the Railway process starts if the current time is inside a market window, and then runs every 60 minutes during broad UTC market windows covering ASX, London and North America. EODHD is recommended for production; without it, `auto` provider mode falls back to known fund NAV sources, Yahoo delayed quotes and Stooq.

Required Railway variables:

```text
SYNC_SECRET=<different long random value>
IBKR_FLEX_TOKEN=<private Flex Web Service token>
IBKR_FLEX_QUERY_ID=<IBKR NS query ID>
IBKR_FLEX_OWNER=SMSF
DIRECTSHARES_EMAIL_HOST=imap.gmail.com
DIRECTSHARES_EMAIL_USER=<mailbox user>
DIRECTSHARES_EMAIL_PASSWORD=<mailbox app password>
DIRECTSHARES_DIVIDEND_EMAIL_MAILBOX=INBOX
DIRECTSHARES_EMAIL_MAILBOX=<mailbox or label containing confirmations>
DIRECTSHARES_EMAIL_OWNER=PERSONAL
EODHD_API_TOKEN=<private EODHD API token, optional but required for scheduled market quote refresh>
```

Optional overrides:

```text
NORTHSTAR_AUTO_SYNC=false
NORTHSTAR_STARTUP_SYNC=true
NORTHSTAR_STARTUP_SYNC_DELAY_SECONDS=180
NORTHSTAR_AUTO_SYNC_HOUR_UTC=20
NORTHSTAR_AUTO_SYNC_MINUTE_UTC=30
NORTHSTAR_AUTO_PRICE_REFRESH=false
NORTHSTAR_INTRADAY_PRICE_REFRESH=true
NORTHSTAR_INTRADAY_PRICE_REFRESH_INTERVAL_MINUTES=60
NORTHSTAR_INTRADAY_PRICE_PROVIDER=auto
NORTHSTAR_INTRADAY_PRICE_REFRESH_WINDOWS_UTC=23:00-06:30,07:30-21:30
NORTHSTAR_INTRADAY_PRICE_REFRESH_STARTUP_DELAY_SECONDS=120
NEXT_PUBLIC_TRADINGVIEW_CHART_URL=https://www.tradingview.com/chart/<your-layout-id>/
```

`NEXT_PUBLIC_TRADINGVIEW_CHART_URL` is optional public configuration, not a secret. Set it to your saved TradingView chart layout URL if you want SouthernStar chart links to open your logged-in TradingView layout with the requested symbol applied.

## PWA installation

SouthernStar can be installed from its Railway URL. On Chrome or Edge, use the **Install SouthernStar** link when it appears. On iPhone or iPad, open SouthernStar in Safari, use **Share**, then choose **Add to Home Screen**. On Safari for Mac, use **File → Add to Dock**.

The PWA requires an internet connection for portfolio data. The service worker caches only static application files and a generic offline page; it does not cache API responses, holdings, balances or transactions.

## Local development

```bash
npm install --no-audit --no-fund
npm run dev -- -p 3001 -H 127.0.0.1
```

With no `DATABASE_URL`, data is stored in `.southern-star/data.json`.

## Security

Do not commit broker files, banking credentials, Flex tokens or API keys. Store production secrets only in Railway environment variables.
