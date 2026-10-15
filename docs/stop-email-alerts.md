# Stop email alerts

Configure `RESEND_API_KEY` and `STOP_ALERT_EMAIL_FROM` in Railway Variables. Use a sending-only key and a verified sender in your existing Resend account. Never put the key into a browser form or Git. No new paid service is required if the combined account usage remains within the existing free allowance. Resend lists 3,000 transactional emails per month, capped at 100 per day on its free plan (checked 15 October 2026): https://resend.com/pricing.

Under **Stops & Orders → Email alerts**, save the receiving address, then enable alerts once the sender is configured. Saving a recipient with alerts off sends no email. Alerts cover Personal and SMSF positions.

After the existing full sync, intraday price sync, manual quote refresh or worker price refresh, SS checks recorded prices against the active imported broker trigger, falling back to the saved SS plan/review level. Distance is `(price - level) / price × 100`. Warning is at or within 5%, urgent at or within 2%, and breached at or below the level. These are observations of recorded prices, not real-time monitoring or execution confirmations.

Missing, invalid, future-dated or older-than-three-calendar-day prices are skipped. Imported broker stops must also be within three days. Broker and price dates appear in emails. The three-day tolerance accommodates weekends; it does not make a delayed quote live.

Delivery history is retained in PostgreSQL, keyed by receiving address, legal owner, broker account, instrument, source and level. Repeats at the same or lower severity remain suppressed after restarts and price recoveries. Changing the level or recipient creates a separate alert history. Initial activation can send alerts for positions already in a warning zone. A run attempts up to 20 new emails, prioritising breaches and urgent warnings.

One database advisory lock serializes delivery runs and settings updates across instances. A pending email is saved before its API call; retries reuse the exact message and Resend idempotency key. An ambiguous delivery stops retrying after 23 hours, before Resend's 24-hour idempotency expiry, and is flagged for review. A provider acceptance reference means accepted for delivery, not proven inbox receipt. Configure provider webhooks separately if delivery/bounce confirmation is needed.

To review an ambiguous attempt, inspect `stop_alert_events` by its id and compare that idempotency key with the provider's logs. Mark it `sent` with the provider reference if accepted. Do not delete it to force a resend unless you have established that no email was accepted. A later severity escalation may still send a new alert.
