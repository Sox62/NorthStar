CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"owner_type" text,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"duration_ms" integer,
	"record_count" integer,
	"position_count" integer,
	"cash_aud" numeric(28, 2),
	"message" text,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "sync_runs_source_finished_idx" ON "sync_runs" USING btree ("source","finished_at");--> statement-breakpoint
CREATE INDEX "sync_runs_status_finished_idx" ON "sync_runs" USING btree ("status","finished_at");
