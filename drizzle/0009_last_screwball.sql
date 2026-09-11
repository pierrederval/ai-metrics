CREATE TABLE "repo_ai_detections" (
	"repository_id" text NOT NULL,
	"agent" text NOT NULL,
	"signal" text NOT NULL,
	"kind" text NOT NULL,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"occurrences" integer,
	"evidence" jsonb NOT NULL,
	"detector_version" text NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repo_ai_detections_repository_id_agent_signal_pk" PRIMARY KEY("repository_id","agent","signal"),
	CONSTRAINT "repo_ai_detections_signal" CHECK ("repo_ai_detections"."signal" IN ('executed','configured','declared')),
	CONSTRAINT "repo_ai_detections_kind" CHECK ("repo_ai_detections"."kind" IN ('coding-agent','llm-in-ci')),
	CONSTRAINT "repo_ai_detections_occurrences" CHECK ("repo_ai_detections"."occurrences" IS NULL OR "repo_ai_detections"."occurrences" >= 0)
);
--> statement-breakpoint
CREATE TABLE "repo_detection_state" (
	"repository_id" text PRIMARY KEY NOT NULL,
	"scanned_sha" text,
	"detector_version" text NOT NULL,
	"executed_refreshed_at" timestamp with time zone,
	"configured_refreshed_at" timestamp with time zone,
	"incomplete_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_ai_detections" ADD CONSTRAINT "repo_ai_detections_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_detection_state" ADD CONSTRAINT "repo_detection_state_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repo_ai_detections_repository" ON "repo_ai_detections" USING btree ("repository_id");