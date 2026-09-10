CREATE TABLE "invitation_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"invitation_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"encrypted_token" text,
	"encrypted_payload" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"state" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_id" text,
	"error_code" text,
	CONSTRAINT "invitation_deliveries_state" CHECK ("invitation_deliveries"."state" IN ('queued','sending','sent','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "workspace_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_memberships_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id"),
	CONSTRAINT "workspace_memberships_role" CHECK ("workspace_memberships"."role" IN ('owner','member'))
);
--> statement-breakpoint
CREATE TABLE "workspace_repositories" (
	"workspace_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"connected_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_repositories_workspace_id_repository_id_pk" PRIMARY KEY("workspace_id","repository_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_for_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_default_for_user_id_unique" UNIQUE("default_for_user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "invitation_deliveries" ADD CONSTRAINT "invitation_deliveries_invitation_id_workspace_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."workspace_invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_deliveries" ADD CONSTRAINT "invitation_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_deliveries" ADD CONSTRAINT "invitation_deliveries_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_repositories" ADD CONSTRAINT "workspace_repositories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_repositories" ADD CONSTRAINT "workspace_repositories_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_repositories" ADD CONSTRAINT "workspace_repositories_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_default_for_user_id_users_id_fk" FOREIGN KEY ("default_for_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_deliveries_owner_time" ON "invitation_deliveries" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE INDEX "invitation_deliveries_workspace_time" ON "invitation_deliveries" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "invitation_deliveries_invitation_time" ON "invitation_deliveries" USING btree ("invitation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitations_open_email" ON "workspace_invitations" USING btree ("workspace_id","email") WHERE "workspace_invitations"."accepted_at" IS NULL AND "workspace_invitations"."revoked_at" IS NULL;