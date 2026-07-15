CREATE TABLE "allocation_targets" (
	"sector" text PRIMARY KEY NOT NULL,
	"target_percent" numeric(8, 4) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "allocation_targets" ("sector", "target_percent") VALUES
	('Silver miners', 30),
	('Gold miners', 20),
	('Uranium miners', 20),
	('Platinum bullion', 20),
	('Rhodium metal', 4),
	('Silver bullion', 2),
	('Oil', 2),
	('Cash', 2)
ON CONFLICT ("sector") DO NOTHING;
