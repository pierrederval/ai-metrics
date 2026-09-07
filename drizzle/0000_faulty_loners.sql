CREATE TABLE "changed_files" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"commit_sha" text,
	"from_sha" text,
	"provenance" text NOT NULL,
	"path" text NOT NULL,
	"change_type" text NOT NULL,
	"additions" integer NOT NULL,
	"deletions" integer NOT NULL,
	"normalized" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ci_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"ci_run_id" text NOT NULL,
	"github_check_run_id" text NOT NULL,
	"app_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"normalized" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ci_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"github_run_id" text,
	"run_attempt" integer DEFAULT 1 NOT NULL,
	"head_sha" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commits" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"sha" text NOT NULL,
	"author_login" text,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate_policies" (
	"repository_id" text NOT NULL,
	"version" integer NOT NULL,
	"gates" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gate_policies_repository_id_version_pk" PRIMARY KEY("repository_id","version")
);
--> statement-breakpoint
CREATE TABLE "github_events" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"event_name" text NOT NULL,
	"action" text,
	"installation_id" text,
	"repository_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"disposition" text DEFAULT 'pending' NOT NULL,
	"dispatched_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	CONSTRAINT "github_events_delivery_id_unique" UNIQUE("delivery_id")
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"github_installation_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_installations_github_installation_id_unique" UNIQUE("github_installation_id")
);
--> statement-breakpoint
CREATE TABLE "ci_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"ci_check_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pr_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"ci_attempt_count" integer NOT NULL,
	"first_pass_green" boolean,
	"eventually_green" boolean,
	"attempts_to_green" integer,
	"time_to_first_green_seconds" integer,
	"failed_check_count" integer NOT NULL,
	"unique_failed_gate_count" integer NOT NULL,
	"test_files_changed" integer NOT NULL,
	"harness_files_changed" integer NOT NULL,
	"harness_changed_after_failure" boolean,
	"clean_green" boolean,
	"evidence_status" text NOT NULL,
	"evidence_reasons" jsonb NOT NULL,
	"analyzer_version" text NOT NULL,
	"gate_policy_version" integer NOT NULL,
	"projection" jsonb NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pr_metrics_pull_request_id_unique" UNIQUE("pull_request_id")
);
--> statement-breakpoint
CREATE TABLE "pr_ci_runs" (
	"pull_request_id" text NOT NULL,
	"ci_run_id" text NOT NULL,
	CONSTRAINT "pr_ci_runs_pull_request_id_ci_run_id_pk" PRIMARY KEY("pull_request_id","ci_run_id")
);
--> statement-breakpoint
CREATE TABLE "pull_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"github_pr_id" text NOT NULL,
	"github_pr_number" integer NOT NULL,
	"title" text NOT NULL,
	"state" text NOT NULL,
	"author_login" text NOT NULL,
	"head_sha" text NOT NULL,
	"base_sha" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"merged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"agent_provider" text DEFAULT 'unknown' NOT NULL,
	"facts" jsonb NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pull_requests_github_pr_id_unique" UNIQUE("github_pr_id")
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" text NOT NULL,
	"github_repository_id" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"default_branch" text NOT NULL,
	"is_private" boolean NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"sync_progress" integer DEFAULT 0 NOT NULL,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_github_repository_id_unique" UNIQUE("github_repository_id")
);
--> statement-breakpoint
CREATE TABLE "pr_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"sha" text NOT NULL,
	"previous_sha" text,
	"observed_at" timestamp with time zone,
	"diff_complete" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"credentials" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "changed_files" ADD CONSTRAINT "changed_files_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_checks" ADD CONSTRAINT "ci_checks_ci_run_id_ci_runs_id_fk" FOREIGN KEY ("ci_run_id") REFERENCES "public"."ci_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commits" ADD CONSTRAINT "commits_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_policies" ADD CONSTRAINT "gate_policies_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_observations" ADD CONSTRAINT "ci_observations_ci_check_id_ci_checks_id_fk" FOREIGN KEY ("ci_check_id") REFERENCES "public"."ci_checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_metrics" ADD CONSTRAINT "pr_metrics_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_ci_runs" ADD CONSTRAINT "pr_ci_runs_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_ci_runs" ADD CONSTRAINT "pr_ci_runs_ci_run_id_ci_runs_id_fk" FOREIGN KEY ("ci_run_id") REFERENCES "public"."ci_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_github_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_revisions" ADD CONSTRAINT "pr_revisions_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commit_pr_sha" ON "commits" USING btree ("pull_request_id","sha");--> statement-breakpoint
CREATE UNIQUE INDEX "pr_repo_number" ON "pull_requests" USING btree ("repository_id","github_pr_number");