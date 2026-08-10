CREATE TABLE IF NOT EXISTS "ibkr_open_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "portfolio_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "order_id" text NOT NULL,
  "conid" text,
  "symbol" text NOT NULL,
  "name" text NOT NULL,
  "exchange" text NOT NULL,
  "currency" text NOT NULL,
  "side" text NOT NULL,
  "status" text NOT NULL,
  "order_type" text NOT NULL,
  "time_in_force" text NOT NULL,
  "total_quantity" numeric(28,10),
  "filled_quantity" numeric(28,10),
  "remaining_quantity" numeric(28,10),
  "limit_price" numeric(28,10),
  "stop_price" numeric(28,10),
  "average_price" numeric(28,10),
  "description" text DEFAULT '' NOT NULL,
  "source" text DEFAULT 'IBKR Flex' NOT NULL,
  "raw" jsonb,
  "as_of_date" date NOT NULL,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ibkr_open_orders" ADD CONSTRAINT "ibkr_open_orders_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ibkr_open_orders" ADD CONSTRAINT "ibkr_open_orders_account_id_broker_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ibkr_open_order_account_order_uq" ON "ibkr_open_orders" USING btree ("account_id","order_id","source");
--> statement-breakpoint
CREATE INDEX "ibkr_open_order_portfolio_idx" ON "ibkr_open_orders" USING btree ("portfolio_id");
