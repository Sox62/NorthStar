CREATE TABLE "broker_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"broker" text NOT NULL,
	"external_account_id" text NOT NULL,
	"currency" text DEFAULT 'AUD' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"institution" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'AUD' NOT NULL,
	"balance" numeric(28, 2) DEFAULT '0' NOT NULL,
	"fx_rate_to_aud" numeric(28, 10) DEFAULT '1' NOT NULL,
	"balance_aud" numeric(28, 2) DEFAULT '0' NOT NULL,
	"as_of_date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "current_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"source" text NOT NULL,
	"quantity" numeric(28, 10) NOT NULL,
	"last_price" numeric(28, 10),
	"average_cost_aud" numeric(28, 10) DEFAULT '0' NOT NULL,
	"cost_aud" numeric(28, 2) DEFAULT '0' NOT NULL,
	"market_value_aud" numeric(28, 2) DEFAULT '0' NOT NULL,
	"day_gain_aud" numeric(28, 2) DEFAULT '0' NOT NULL,
	"pnl_aud" numeric(28, 2) DEFAULT '0' NOT NULL,
	"pnl_percent" numeric(18, 6) DEFAULT '0' NOT NULL,
	"valuation_basis" text DEFAULT 'market' NOT NULL,
	"as_of_date" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"price_date" date NOT NULL,
	"close" numeric(28, 10) NOT NULL,
	"currency" text NOT NULL,
	"source" text NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source" text NOT NULL,
	"record_count" numeric(12, 0) NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_key" text NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"exchange" text NOT NULL,
	"currency" text NOT NULL,
	"asset_class" text NOT NULL,
	"conid" text,
	"isin" text,
	"provider_symbol" text
);
--> statement-breakpoint
CREATE TABLE "portfolio_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_currency" text DEFAULT 'AUD' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"market_value" numeric(28, 2) NOT NULL,
	"cash_value" numeric(28, 2) NOT NULL,
	"net_contributions" numeric(28, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid,
	"name" text NOT NULL,
	"legal_owner_type" text NOT NULL,
	"base_currency" text DEFAULT 'AUD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"instrument_id" uuid,
	"type" text NOT NULL,
	"trade_date" date NOT NULL,
	"settle_date" date,
	"quantity" numeric(28, 10),
	"price" numeric(28, 10),
	"close_price" numeric(28, 10),
	"cost" numeric(28, 10),
	"currency" text NOT NULL,
	"fees" numeric(28, 10) DEFAULT '0' NOT NULL,
	"taxes" numeric(28, 10) DEFAULT '0' NOT NULL,
	"net_cash" numeric(28, 10),
	"fx_rate_to_base" numeric(28, 10),
	"realised_pnl" numeric(28, 10),
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broker_accounts" ADD CONSTRAINT "broker_accounts_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_positions" ADD CONSTRAINT "current_positions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_positions" ADD CONSTRAINT "current_positions_account_id_broker_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_positions" ADD CONSTRAINT "current_positions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_prices" ADD CONSTRAINT "daily_prices_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_account_id_broker_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_group_id_portfolio_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."portfolio_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_broker_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "broker_account_external_uq" ON "broker_accounts" USING btree ("portfolio_id","broker","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_account_portfolio_name_uq" ON "cash_accounts" USING btree ("portfolio_id","institution","name");--> statement-breakpoint
CREATE UNIQUE INDEX "position_account_instrument_source_uq" ON "current_positions" USING btree ("account_id","instrument_id","source");--> statement-breakpoint
CREATE UNIQUE INDEX "price_instrument_date_uq" ON "daily_prices" USING btree ("instrument_id","price_date");--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_source_external_uq" ON "instruments" USING btree ("source","external_key");--> statement-breakpoint
CREATE INDEX "instrument_ticker_idx" ON "instruments" USING btree ("ticker");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_group_name_uq" ON "portfolio_groups" USING btree ("name");--> statement-breakpoint
CREATE INDEX "snapshot_portfolio_captured_idx" ON "portfolio_snapshots" USING btree ("portfolio_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_owner_type_uq" ON "portfolios" USING btree ("legal_owner_type");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_source_external_uq" ON "transactions" USING btree ("account_id","source","external_id");