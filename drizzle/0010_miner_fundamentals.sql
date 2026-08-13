CREATE TABLE IF NOT EXISTS "miner_fundamentals" (
  "symbol" text PRIMARY KEY NOT NULL,
  "name" text,
  "primary_metal" text,
  "jurisdiction" text,
  "project_stage" text,
  "production_oz" numeric(28,4),
  "aisc_usd_per_oz" numeric(28,4),
  "resource_moz" numeric(28,6),
  "reserve_moz" numeric(28,6),
  "cash_aud" numeric(28,2),
  "debt_aud" numeric(28,2),
  "market_cap_aud" numeric(28,2),
  "npv_aud" numeric(28,2),
  "capex_aud" numeric(28,2),
  "irr_percent" numeric(18,6),
  "jurisdiction_score" integer,
  "balance_sheet_score" integer,
  "dilution_score" integer,
  "management_score" integer,
  "notes" text,
  "source_url" text,
  "as_of_date" date,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miner_fundamentals_metal_idx" ON "miner_fundamentals" USING btree ("primary_metal");
