CREATE TABLE "dashboard_pr_evidence" (
	"pull_request_id" text PRIMARY KEY NOT NULL,
	"merge_head_sha" text,
	"review_expected" boolean,
	"ci_expected" boolean,
	"chronology_complete" boolean DEFAULT false NOT NULL,
	"reviews_complete" boolean DEFAULT false NOT NULL,
	"ci_complete" boolean DEFAULT false NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_updated_at" timestamp with time zone,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history_backfill_items" (
	"backfill_id" text NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_at" timestamp with time zone,
	"error_category" text,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "history_backfill_items_backfill_id_number_pk" PRIMARY KEY("backfill_id","number"),
	CONSTRAINT "history_backfill_items_number" CHECK ("history_backfill_items"."number" > 0),
	CONSTRAINT "history_backfill_items_status" CHECK ("history_backfill_items"."status" IN ('pending','importing','retrying','complete','failed'))
);
--> statement-breakpoint
CREATE TABLE "history_backfills" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"cutoff" timestamp with time zone NOT NULL,
	"cursor" text,
	"status" text NOT NULL,
	"retry_at" timestamp with time zone,
	"error_category" text,
	"dispatched_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "history_backfills_status" CHECK ("history_backfills"."status" IN ('queued','discovering','importing','retrying','complete','partial','failed'))
);
--> statement-breakpoint
CREATE TABLE "pr_workflow_attempts" (
	"pull_request_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"run_id" text NOT NULL,
	"attempt" integer NOT NULL,
	CONSTRAINT "pr_workflow_attempts_pull_request_id_repository_id_run_id_attempt_pk" PRIMARY KEY("pull_request_id","repository_id","run_id","attempt")
);
--> statement-breakpoint
CREATE TABLE "review_events" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"source_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"state" text NOT NULL,
	"commit_sha" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_events_kind" CHECK ("review_events"."kind" IN ('review','requested','dismissed','request-removed'))
);
--> statement-breakpoint
CREATE TABLE "user_interests" (
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_interests_user_id_feature_pk" PRIMARY KEY("user_id","feature")
);
--> statement-breakpoint
CREATE TABLE "workflow_attempts" (
	"repository_id" text NOT NULL,
	"run_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"head_sha" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_attempts_repository_id_run_id_attempt_pk" PRIMARY KEY("repository_id","run_id","attempt"),
	CONSTRAINT "workflow_attempts_attempt" CHECK ("workflow_attempts"."attempt" > 0)
);
--> statement-breakpoint
ALTER TABLE "dashboard_pr_evidence" ADD CONSTRAINT "dashboard_pr_evidence_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_backfill_items" ADD CONSTRAINT "history_backfill_items_backfill_id_history_backfills_id_fk" FOREIGN KEY ("backfill_id") REFERENCES "public"."history_backfills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_backfills" ADD CONSTRAINT "history_backfills_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_workflow_attempts" ADD CONSTRAINT "pr_workflow_attempts_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_workflow_attempts" ADD CONSTRAINT "pr_workflow_attempts_repository_id_run_id_attempt_workflow_attempts_repository_id_run_id_attempt_fk" FOREIGN KEY ("repository_id","run_id","attempt") REFERENCES "public"."workflow_attempts"("repository_id","run_id","attempt") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_attempts" ADD CONSTRAINT "workflow_attempts_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_backfill_items_retry" ON "history_backfill_items" USING btree ("status","retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "history_backfills_one_active" ON "history_backfills" USING btree ("repository_id") WHERE "history_backfills"."status" IN ('queued','discovering','importing','retrying');--> statement-breakpoint
CREATE INDEX "history_backfills_retry" ON "history_backfills" USING btree ("status","retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_events_source_identity" ON "review_events" USING btree ("pull_request_id","source","source_id");--> statement-breakpoint
CREATE INDEX "review_events_pr_time" ON "review_events" USING btree ("pull_request_id","occurred_at");--> statement-breakpoint
CREATE INDEX "workflow_attempts_sha" ON "workflow_attempts" USING btree ("repository_id","head_sha");