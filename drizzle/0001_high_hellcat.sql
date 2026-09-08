CREATE TABLE "repository_import_items" (
	"run_id" text NOT NULL,
	"number" integer NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "repository_import_items_run_id_number_pk" PRIMARY KEY("run_id","number"),
	CONSTRAINT "repository_import_items_number" CHECK ("repository_import_items"."number" > 0),
	CONSTRAINT "repository_import_items_state" CHECK ("repository_import_items"."state" IN ('pending','complete','failed'))
);
--> statement-breakpoint
CREATE TABLE "repository_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"retry_of" text,
	"state" text NOT NULL,
	"total" integer,
	"completed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"message" text,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "repository_imports_state" CHECK ("repository_imports"."state" IN ('queued','discovering','importing','complete','partial','failed')),
	CONSTRAINT "repository_imports_total" CHECK ("repository_imports"."total" BETWEEN 0 AND 100),
	CONSTRAINT "repository_imports_completed" CHECK ("repository_imports"."completed" >= 0),
	CONSTRAINT "repository_imports_failed" CHECK ("repository_imports"."failed" >= 0),
	CONSTRAINT "repository_imports_counts" CHECK ("repository_imports"."total" IS NULL OR "repository_imports"."completed" + "repository_imports"."failed" <= "repository_imports"."total")
);
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "tracking_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repository_import_items" ADD CONSTRAINT "repository_import_items_run_id_repository_imports_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."repository_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_imports" ADD CONSTRAINT "repository_imports_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_imports" ADD CONSTRAINT "repository_imports_retry_of_repository_imports_id_fk" FOREIGN KEY ("retry_of") REFERENCES "public"."repository_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_imports_one_active" ON "repository_imports" USING btree ("repository_id") WHERE "repository_imports"."state" IN ('queued','discovering','importing');--> statement-breakpoint
CREATE INDEX "repository_imports_latest" ON "repository_imports" USING btree ("repository_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "repository_imports_one_retry" ON "repository_imports" USING btree ("retry_of") WHERE "repository_imports"."retry_of" IS NOT NULL;
--> statement-breakpoint
UPDATE repositories r SET tracking_started_at = r.created_at
WHERE r.is_demo = false AND EXISTS (
  SELECT 1 FROM pull_requests p WHERE p.repository_id = r.id
);
