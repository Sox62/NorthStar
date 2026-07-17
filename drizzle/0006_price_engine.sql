CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency" text NOT NULL,
	"rate_to_aud" numeric(28, 10) NOT NULL,
	"rate_date" date NOT NULL,
	"source" text NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rate_currency_date_source_uq" ON "fx_rates" USING btree ("currency","rate_date","source");--> statement-breakpoint
CREATE INDEX "fx_rate_currency_date_idx" ON "fx_rates" USING btree ("currency","rate_date");
