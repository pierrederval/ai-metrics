ALTER TABLE "review_events" ADD COLUMN "dismissed_review_id" text;--> statement-breakpoint
ALTER TABLE "workflow_attempts" ADD COLUMN "terminal_observed_at" timestamp with time zone;