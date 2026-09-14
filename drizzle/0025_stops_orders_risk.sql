CREATE TABLE IF NOT EXISTS "position_risk_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "portfolio_id" uuid NOT NULL REFERENCES "portfolios"("id"),
  "account_id" uuid NOT NULL REFERENCES "broker_accounts"("id"),
  "instrument_id" uuid NOT NULL REFERENCES "instruments"("id"),
  "stop_type" text DEFAULT 'MANUAL_REVIEW' NOT NULL,
  "planned_stop_price" numeric(28, 10),
  "planned_target_price" numeric(28, 10),
  "rationale" text,
  "invalidation_notes" text,
  "sector_benchmark_symbol" text,
  "review_status" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "position_risk_plan_position_uq" ON "position_risk_plans" ("portfolio_id","account_id","instrument_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "position_risk_plan_portfolio_idx" ON "position_risk_plans" ("portfolio_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "broker_order_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "portfolio_id" uuid NOT NULL REFERENCES "portfolios"("id"),
  "account_id" uuid NOT NULL REFERENCES "broker_accounts"("id"),
  "order_id" text NOT NULL,
  "source" text NOT NULL,
  "status" text NOT NULL,
  "event_type" text NOT NULL,
  "raw" jsonb,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "broker_order_events_order_idx" ON "broker_order_events" ("account_id","order_id","observed_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_risk_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" text NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "nav_aud" numeric(28, 2) NOT NULL,
  "invested_capital_aud" numeric(28, 2) NOT NULL,
  "deployable_cash_aud" numeric(28, 2) NOT NULL,
  "pending_order_capital_aud" numeric(28, 2) NOT NULL,
  "total_stop_risk_aud" numeric(28, 2) NOT NULL,
  "total_stop_risk_percent_nav" numeric(18, 6) NOT NULL,
  "positions_with_stops" integer NOT NULL,
  "positions_without_stops" integer NOT NULL,
  "largest_single_position_risk_aud" numeric(28, 2) NOT NULL,
  "largest_sector_risk_aud" numeric(28, 2) NOT NULL,
  "calculation_version" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_risk_snapshots_scope_captured_idx" ON "portfolio_risk_snapshots" ("scope","captured_at");
--> statement-breakpoint
INSERT INTO "position_risk_plans" (
  "portfolio_id","account_id","instrument_id","stop_type","planned_stop_price","planned_target_price",
  "rationale","invalidation_notes","sector_benchmark_symbol","review_status"
)
SELECT cp.portfolio_id, cp.account_id, cp.instrument_id,
  CASE i.ticker WHEN 'BMN' THEN 'STRUCTURAL' WHEN 'LEU' THEN 'MANUAL_REVIEW' ELSE 'TACTICAL' END,
  seed.stop_price, seed.target_price,
  seed.rationale, seed.notes, seed.benchmark, 'seeded'
FROM current_positions cp
JOIN instruments i ON i.id = cp.instrument_id
JOIN (
  VALUES
    ('SMR', 2.20::numeric, NULL::numeric, 'Recorded protective stop from initial working register.', 'Seed/reconciliation data; verify against broker state.', NULL),
    ('STNG', 72.00::numeric, 97.50::numeric, 'Recorded protective stop from initial working register.', 'Target discussed as approximately US$95-100.', NULL),
    ('DBA', 27.30::numeric, NULL::numeric, 'Recorded protective stop from initial working register.', 'Seed/reconciliation data; verify against broker state.', NULL),
    ('COCO', 8.16::numeric, NULL::numeric, 'Recorded protective stop from initial working register.', 'Seed/reconciliation data; verify against broker state.', NULL),
    ('BMN', 2.80::numeric, NULL::numeric, 'Structural stop deliberately widened from A$3.43.', 'Seed/reconciliation data; verify against broker state.', 'URNM'),
    ('LEU', 154.00::numeric, 295.00::numeric, 'Recorded broker stop; structural alternative near US$140 discussed but not confirmed.', 'Manual review required before treating the structural alternative as plan.', 'URNM'),
    ('MGY', 21.52::numeric, 54.00::numeric, 'Recorded protective stop from initial working register.', 'Seed/reconciliation data; verify against broker state.', 'XOP'),
    ('OBE', 14.36::numeric, 19.63::numeric, 'Recorded protective stop from initial working register.', 'Seed/reconciliation data; verify against broker state.', 'XOP'),
    ('XOP', 165.00::numeric, NULL::numeric, 'Recorded protective stop from initial working register.', 'ETF position: sector benchmark is self-reference.', 'XOP'),
    ('XLE', 57.30::numeric, 75.00::numeric, 'Recorded protective stop from initial working register.', 'Seed/reconciliation data; verify against broker state.', 'XLE')
) AS seed(symbol, stop_price, target_price, rationale, notes, benchmark) ON UPPER(i.ticker) = seed.symbol
ON CONFLICT ("portfolio_id","account_id","instrument_id") DO NOTHING;
