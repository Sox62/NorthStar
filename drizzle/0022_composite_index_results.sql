CREATE TABLE IF NOT EXISTS "composite_index_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "definition_id" text NOT NULL,
  "result_date" date NOT NULL,
  "score" numeric(8,4),
  "status" text NOT NULL,
  "regime_id" text,
  "regime_label" text,
  "calculation_version" text NOT NULL,
  "as_of_date" date,
  "available_weight" numeric(8,4) DEFAULT '0' NOT NULL,
  "missing_weight" numeric(8,4) DEFAULT '0' NOT NULL,
  "components" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "inputs" jsonb,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "composite_index_definition_date_version_uq" ON "composite_index_results" USING btree ("definition_id","result_date","calculation_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "composite_index_definition_date_idx" ON "composite_index_results" USING btree ("definition_id","result_date");
