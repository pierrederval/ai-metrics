CREATE TABLE "grade_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"family" text NOT NULL,
	"rubric_version" text NOT NULL,
	"evaluator_version" text NOT NULL,
	"requested_by" text NOT NULL,
	"requested_workspace_id" text NOT NULL,
	"retry_of" text,
	"state" text NOT NULL,
	"sha" text,
	"result" jsonb,
	"error_code" text,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "grade_runs_state" CHECK ("grade_runs"."state" IN ('queued','running','complete','failed')),
	CONSTRAINT "grade_runs_score" CHECK (("grade_runs"."result"->>'score')::integer BETWEEN 0 AND 100),
	CONSTRAINT "grade_runs_result" CHECK (("grade_runs"."state" = 'complete' AND "grade_runs"."sha" IS NOT NULL AND "grade_runs"."completed_at" IS NOT NULL AND "grade_runs"."result" IS NOT NULL AND "grade_runs"."result"->>'score' IS NOT NULL) OR ("grade_runs"."state" <> 'complete' AND "grade_runs"."result" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "grading_rubrics" (
	"family" text NOT NULL,
	"version" text NOT NULL,
	"evaluator_version" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grading_rubrics_family_version_pk" PRIMARY KEY("family","version")
);
--> statement-breakpoint
ALTER TABLE "grade_runs" ADD CONSTRAINT "grade_runs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_runs" ADD CONSTRAINT "grade_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_runs" ADD CONSTRAINT "grade_runs_requested_workspace_id_workspaces_id_fk" FOREIGN KEY ("requested_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_runs" ADD CONSTRAINT "grade_runs_retry_of_grade_runs_id_fk" FOREIGN KEY ("retry_of") REFERENCES "public"."grade_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grade_runs_one_active" ON "grade_runs" USING btree ("repository_id","family") WHERE "grade_runs"."state" IN ('queued','running');--> statement-breakpoint
CREATE INDEX "grade_runs_latest" ON "grade_runs" USING btree ("repository_id","created_at" DESC NULLS LAST);