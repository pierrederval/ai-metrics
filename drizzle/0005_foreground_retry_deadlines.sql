ALTER TABLE "foreground_hydrations" ADD COLUMN "retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "foreground_hydrations" ADD COLUMN "error_category" text;