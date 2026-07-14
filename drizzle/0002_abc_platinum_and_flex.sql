CREATE TABLE "platinum_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"product_key" text NOT NULL,
	"product_name" text NOT NULL,
	"retail_aud_per_kg" numeric(28, 10) NOT NULL,
	"buyback_aud_per_kg" numeric(28, 10) NOT NULL,
	"source_url" text NOT NULL,
	"price_date" date NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_assets" ADD COLUMN "quantity_kg" numeric(28, 10) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_assets" ADD COLUMN "buyback_aud_per_kg" numeric(28, 10) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_assets" ADD COLUMN "retail_aud_per_kg" numeric(28, 10) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_assets" ADD COLUMN "price_provider" text DEFAULT 'ABC Bullion' NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_assets" ADD COLUMN "price_source_url" text DEFAULT 'https://www.abcbullion.com/sell/platinum' NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_assets" ADD COLUMN "price_retrieved_at" timestamp with time zone;--> statement-breakpoint
UPDATE "manual_assets"
SET "quantity_kg" = CASE WHEN "quantity_troy_oz" > 0 THEN "quantity_troy_oz" / 32.1507465686 ELSE 0 END,
    "buyback_aud_per_kg" = CASE WHEN "current_price_aud_per_oz" > 0 THEN "current_price_aud_per_oz" * 32.1507465686 ELSE 0 END,
    "retail_aud_per_kg" = CASE WHEN "current_price_aud_per_oz" > 0 THEN "current_price_aud_per_oz" * 32.1507465686 ELSE 0 END,
    "price_retrieved_at" = "updated_at";--> statement-breakpoint
CREATE UNIQUE INDEX "platinum_price_provider_product_date_uq" ON "platinum_prices" USING btree ("provider","product_key","price_date");