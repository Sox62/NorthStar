CREATE TABLE IF NOT EXISTS "structural_levels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "symbol" text NOT NULL,
  "comparison_symbol" text NOT NULL,
  "label" text NOT NULL,
  "timeframe" text NOT NULL,
  "direction" text NOT NULL,
  "level" numeric(28,10) NOT NULL,
  "status" text NOT NULL,
  "source" text,
  "notes" text,
  "as_of_date" date,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "structural_levels_symbol_idx" ON "structural_levels" USING btree ("symbol");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "structural_levels_pair_idx" ON "structural_levels" USING btree ("symbol","comparison_symbol");
