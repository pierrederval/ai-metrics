ALTER TABLE "pull_requests" ADD COLUMN "head_ref" text;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "agent_markers" jsonb DEFAULT '[]'::jsonb NOT NULL;