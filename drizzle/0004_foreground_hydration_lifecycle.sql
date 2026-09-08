CREATE TABLE "foreground_hydrations" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"number" integer NOT NULL,
	"source_event_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"execution_id" text,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foreground_hydrations_number" CHECK ("foreground_hydrations"."number" > 0),
	CONSTRAINT "foreground_hydrations_status" CHECK ("foreground_hydrations"."status" IN ('queued','importing','retrying','complete','failed'))
);
--> statement-breakpoint
ALTER TABLE "foreground_hydrations" ADD CONSTRAINT "foreground_hydrations_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foreground_hydrations_active" ON "foreground_hydrations" USING btree ("repository_id","status","updated_at");