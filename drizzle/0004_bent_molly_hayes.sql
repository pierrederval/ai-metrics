ALTER TABLE "invitation_deliveries" ADD COLUMN "encrypted_payload" text;--> statement-breakpoint
ALTER TABLE "invitation_deliveries" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation_deliveries" ADD COLUMN "first_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation_deliveries" ADD COLUMN "lease_until" timestamp with time zone;