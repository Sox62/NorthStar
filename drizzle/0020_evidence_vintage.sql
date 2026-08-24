ALTER TABLE "miner_fundamentals" ADD COLUMN IF NOT EXISTS "economic_study_stage" text;--> statement-breakpoint
ALTER TABLE "miner_fundamentals" ADD COLUMN IF NOT EXISTS "economic_study_date" date;--> statement-breakpoint
ALTER TABLE "miner_fundamentals" ADD COLUMN IF NOT EXISTS "next_study_stage" text;--> statement-breakpoint
ALTER TABLE "miner_fundamentals" ADD COLUMN IF NOT EXISTS "balance_as_of_date" date;--> statement-breakpoint
ALTER TABLE "miner_fundamentals" ADD COLUMN IF NOT EXISTS "market_cap_as_of_date" date;--> statement-breakpoint
ALTER TABLE "miner_fundamentals" ADD COLUMN IF NOT EXISTS "last_capital_event_date" date;
