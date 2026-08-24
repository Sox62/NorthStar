ALTER TABLE "miner_fundamentals" ADD COLUMN IF NOT EXISTS "last_equity_event_date" date;--> statement-breakpoint
ALTER TABLE "miner_fundamentals" ADD COLUMN IF NOT EXISTS "last_debt_event_date" date;
