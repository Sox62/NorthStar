CREATE TABLE "manual_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"asset_type" text NOT NULL,
	"name" text NOT NULL,
	"quantity_troy_oz" numeric(28, 10) NOT NULL,
	"total_cost_aud" numeric(28, 2) DEFAULT '0' NOT NULL,
	"current_price_aud_per_oz" numeric(28, 10) DEFAULT '0' NOT NULL,
	"market_value_aud" numeric(28, 2) DEFAULT '0' NOT NULL,
	"purchase_date" date NOT NULL,
	"as_of_date" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_assets" ADD CONSTRAINT "manual_assets_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_asset_portfolio_idx" ON "manual_assets" USING btree ("portfolio_id");