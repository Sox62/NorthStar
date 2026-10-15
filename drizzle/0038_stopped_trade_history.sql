-- Journal annotations preserve the exit even after a holding disappears. They do not post trades.
CREATE TABLE "stop_exit_revisions" (
  "id" uuid PRIMARY KEY,
  "sequence" bigserial NOT NULL UNIQUE,
  "owner_type" text NOT NULL CHECK (owner_type IN ('PERSONAL','SMSF')),
  "record" jsonb NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT now(),
  CHECK (record->>'ownerType' = owner_type)
);
CREATE INDEX "stop_exit_owner_history_idx" ON "stop_exit_revisions" ("owner_type", "recorded_at");
