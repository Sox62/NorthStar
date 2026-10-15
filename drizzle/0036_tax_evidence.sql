-- Source files and review history support existing transactions; no parallel cash/tax ledger.
CREATE TABLE "tax_evidence_sources" (
  "id" text PRIMARY KEY,
  "portfolio_id" uuid NOT NULL REFERENCES "portfolios"("id"),
  "system" text NOT NULL,
  "account_key" text NOT NULL,
  "filename" text NOT NULL,
  "media_type" text NOT NULL,
  "sha256" text NOT NULL,
  "content_base64" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "imported_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "tax_evidence_source_content_uq" ON "tax_evidence_sources" ("portfolio_id", "system", "account_key", "sha256");
CREATE INDEX "tax_evidence_source_owner_period_idx" ON "tax_evidence_sources" ("portfolio_id", "start_date", "end_date");
CREATE TABLE "tax_evidence_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "portfolio_id" uuid NOT NULL REFERENCES "portfolios"("id"),
  "outgoing_id" uuid NOT NULL REFERENCES "transactions"("id"),
  "incoming_id" uuid NOT NULL REFERENCES "transactions"("id"),
  "action" text NOT NULL CHECK ("action" IN ('match', 'unmatch')),
  "note" text NOT NULL,
  "author" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
