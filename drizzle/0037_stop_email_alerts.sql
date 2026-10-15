CREATE TABLE "stop_alert_settings" (
  "id" text PRIMARY KEY CHECK (id = 'default'),
  "recipient" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "stop_alert_events" (
  "id" text PRIMARY KEY,
  "series_key" text NOT NULL,
  "severity" integer NOT NULL CHECK (severity BETWEEN 1 AND 3),
  "status" text NOT NULL CHECK (status IN ('pending','sent','review')),
  "email" jsonb NOT NULL,
  "provider_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "sent_at" timestamptz
);
CREATE INDEX "stop_alert_events_series_idx" ON "stop_alert_events" ("series_key");
