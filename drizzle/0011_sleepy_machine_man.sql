CREATE TABLE "authoring_remedies" (
	"id" text PRIMARY KEY NOT NULL,
	"authoring_run_id" text NOT NULL,
	"check_id" text NOT NULL,
	"path" text NOT NULL,
	"rationale" text NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "authoring_remedies_ordinal" CHECK ("authoring_remedies"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "authoring_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"kind" text NOT NULL,
	"requested_by" text NOT NULL,
	"requested_workspace_id" text NOT NULL,
	"retry_of" text,
	"state" text NOT NULL,
	"sha" text,
	"author_version" text NOT NULL,
	"model" text,
	"sandbox_id" text,
	"error_code" text,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "authoring_runs_state" CHECK ("authoring_runs"."state" IN ('queued','running','complete','failed')),
	CONSTRAINT "authoring_runs_kind" CHECK ("authoring_runs"."kind" IN ('plan','execute')),
	CONSTRAINT "authoring_runs_complete" CHECK (("authoring_runs"."state" = 'complete' AND "authoring_runs"."sha" IS NOT NULL AND "authoring_runs"."completed_at" IS NOT NULL) OR "authoring_runs"."state" <> 'complete')
);
--> statement-breakpoint
ALTER TABLE "authoring_remedies" ADD CONSTRAINT "authoring_remedies_authoring_run_id_authoring_runs_id_fk" FOREIGN KEY ("authoring_run_id") REFERENCES "public"."authoring_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authoring_runs" ADD CONSTRAINT "authoring_runs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authoring_runs" ADD CONSTRAINT "authoring_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authoring_runs" ADD CONSTRAINT "authoring_runs_requested_workspace_id_workspaces_id_fk" FOREIGN KEY ("requested_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authoring_runs" ADD CONSTRAINT "authoring_runs_retry_of_authoring_runs_id_fk" FOREIGN KEY ("retry_of") REFERENCES "public"."authoring_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "authoring_remedies_change" ON "authoring_remedies" USING btree ("authoring_run_id","check_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "authoring_remedies_order" ON "authoring_remedies" USING btree ("authoring_run_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "authoring_runs_one_active" ON "authoring_runs" USING btree ("repository_id") WHERE "authoring_runs"."state" IN ('queued','running');--> statement-breakpoint
CREATE INDEX "authoring_runs_latest" ON "authoring_runs" USING btree ("repository_id","created_at" DESC NULLS LAST);