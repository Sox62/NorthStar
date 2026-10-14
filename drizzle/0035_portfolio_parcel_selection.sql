-- Which parcels a disposal consumes is an election the taxpayer makes and has to keep records of,
-- so it is stored rather than passed per report run. The default applies to every holding without
-- one of its own; the overrides are keyed "SYMBOL:EXCHANGE", because the election belongs to the
-- security rather than to the account it happens to sit in.
ALTER TABLE "portfolios" ADD COLUMN IF NOT EXISTS "parcel_selection_method" text DEFAULT 'fifo' NOT NULL;
ALTER TABLE "portfolios" ADD COLUMN IF NOT EXISTS "parcel_selection_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;
