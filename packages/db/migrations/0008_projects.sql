-- STL-21 T7: Projects core (fork migrations 0072/0074/0077 verbatim constraints).
-- Satellites project_ticket/project_board/project_repo/project_table_link are NOT
-- created here: their FK targets (task/board/repo/data_table) belong to STL-16/18/24
-- and are absent on this base (see .forge-question.md Q1). They land with wave 2.

CREATE TABLE "project" (
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
	CONSTRAINT "project_status_check" CHECK ("status" in ('planned', 'started', 'completed', 'canceled')),
	CONSTRAINT "project_organization_id_id_unique" UNIQUE("organization_id","id")
);
CREATE TABLE "project_slug_alias" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "project_milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_date" text,
	"rank" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"completed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_milestone_completion_pair_check" CHECK (("completed_at" IS NULL) = ("completed_by" IS NULL)),
	CONSTRAINT "project_milestone_project_id_id_unique" UNIQUE("project_id","id")
);
CREATE TABLE "project_update" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"health" text NOT NULL,
	"edit_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_lead_user_id_user_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_lead_team_id_team_id_fk" FOREIGN KEY ("lead_team_id") REFERENCES "team"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "user"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project_slug_alias" ADD CONSTRAINT "project_slug_alias_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project_slug_alias" ADD CONSTRAINT "project_slug_alias_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project_update" ADD CONSTRAINT "project_update_health_check" CHECK ("health" in ('on-track', 'at-risk', 'off-track'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project_update" ADD CONSTRAINT "project_update_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project_update" ADD CONSTRAINT "project_update_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "project_update" ADD CONSTRAINT "project_update_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
CREATE UNIQUE INDEX "project_organization_slug_lower_unique" ON "project" (organization_id, lower("slug"));
CREATE INDEX "project_organization_archived_idx" ON "project" ("organization_id","archived_at");
CREATE INDEX "project_leadUserId_idx" ON "project" ("lead_user_id");
CREATE INDEX "project_leadTeamId_idx" ON "project" ("lead_team_id");
CREATE UNIQUE INDEX "project_slug_alias_org_slug_lower_unique" ON "project_slug_alias" (organization_id, lower("slug"));
CREATE INDEX "project_slug_alias_project_id_idx" ON "project_slug_alias" ("project_id");
CREATE INDEX "project_milestone_project_rank_created_idx" ON "project_milestone" ("project_id", "rank", "created_at");
CREATE INDEX "project_milestone_completed_by_idx" ON "project_milestone" ("completed_by");
CREATE INDEX "project_update_project_created_at_idx" ON "project_update" ("project_id","created_at" DESC);
CREATE INDEX "project_update_author_id_idx" ON "project_update" ("author_id");
CREATE INDEX "project_update_organization_id_idx" ON "project_update" ("organization_id");
