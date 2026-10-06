CREATE TABLE IF NOT EXISTS "project" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"summary" text NOT NULL,
	"description" text,
	"success_criteria" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"priority" text,
	"lead_user_id" text NOT NULL,
	"lead_team_id" text,
	"start_date" text,
	"target_date" text,
	"org_privilege" text,
	"archived_at" timestamp,
	"archived_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "project_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "project_status_check" CHECK ("status" in ('planned', 'started', 'completed', 'canceled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_slug_alias" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_lead_user_id_user_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_lead_team_id_team_id_fk" FOREIGN KEY ("lead_team_id") REFERENCES "team"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "user"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_slug_alias" ADD CONSTRAINT "project_slug_alias_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_slug_alias" ADD CONSTRAINT "project_slug_alias_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_organization_slug_lower_unique" ON "project" (organization_id, lower("slug"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_organization_archived_idx" ON "project" ("organization_id","archived_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_leadUserId_idx" ON "project" ("lead_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_leadTeamId_idx" ON "project" ("lead_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_slug_alias_organization_slug_lower_unique" ON "project_slug_alias" (organization_id, lower("slug"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_slug_alias_project_id_idx" ON "project_slug_alias" ("project_id");
--> statement-breakpoint
ALTER TABLE "resource_grant"
DROP CONSTRAINT IF EXISTS "resource_grant_resource_type_check";
--> statement-breakpoint
ALTER TABLE "resource_grant"
ADD CONSTRAINT "resource_grant_resource_type_check"
CHECK ("resource_type" IN ('board', 'repo', 'table', 'project'));
