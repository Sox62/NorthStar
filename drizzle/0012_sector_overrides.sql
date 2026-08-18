CREATE TABLE IF NOT EXISTS "sector_overrides" (
	"symbol" text PRIMARY KEY NOT NULL,
	"sector" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
