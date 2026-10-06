-- Repositories as a first-class, organization-level entity.
--
-- Deliberately NOT linked to boards or tasks: repo_issue / repo_pull_request
-- mirror the provider's own shape so issues/PRs are never forced into Kaneo's
-- board/column/task model. There is no foreign key to `task` anywhere here.
--
-- Hand-written because drizzle-kit's stored snapshot still predates the
-- workspace->organization / project->board rename (that was applied to the
-- live database with raw SQL in 0034), so `drizzle-kit generate` offers to
-- "rename" live tables into these new ones. These statements are purely
-- additive and safe to re-run.

CREATE TABLE IF NOT EXISTS "repo" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"external_id" text,
	"url" text NOT NULL,
	"description" text,
	"default_branch" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repo_org_provider_owner_name_unique" UNIQUE("organization_id","provider","owner","name")
);

CREATE TABLE IF NOT EXISTS "repo_issue" (
	"id" text PRIMARY KEY NOT NULL,
	"repo_id" text NOT NULL,
	"number" integer NOT NULL,
	"external_id" text,
	"title" text NOT NULL,
	"body" text,
	"state" text NOT NULL,
	"author_login" text,
	"author_avatar_url" text,
	"assignee_logins" jsonb,
	"labels" jsonb,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"url" text NOT NULL,
	"external_created_at" timestamp,
	"external_updated_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repo_issue_repo_number_unique" UNIQUE("repo_id","number")
);

CREATE TABLE IF NOT EXISTS "repo_pull_request" (
	"id" text PRIMARY KEY NOT NULL,
	"repo_id" text NOT NULL,
	"number" integer NOT NULL,
	"external_id" text,
	"title" text NOT NULL,
	"body" text,
	"state" text NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"author_login" text,
	"author_avatar_url" text,
	"head_branch" text,
	"base_branch" text,
	"labels" jsonb,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"url" text NOT NULL,
	"external_created_at" timestamp,
	"external_updated_at" timestamp,
	"merged_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repo_pull_request_repo_number_unique" UNIQUE("repo_id","number")
);

DO $$ BEGIN
 ALTER TABLE "repo" ADD CONSTRAINT "repo_organization_id_organization_id_fk"
   FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
   ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "repo_issue" ADD CONSTRAINT "repo_issue_repo_id_repo_id_fk"
   FOREIGN KEY ("repo_id") REFERENCES "public"."repo"("id")
   ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "repo_pull_request" ADD CONSTRAINT "repo_pull_request_repo_id_repo_id_fk"
   FOREIGN KEY ("repo_id") REFERENCES "public"."repo"("id")
   ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "repo_organizationId_idx" ON "repo" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "repo_issue_repoId_idx" ON "repo_issue" USING btree ("repo_id");
CREATE INDEX IF NOT EXISTS "repo_issue_state_idx" ON "repo_issue" USING btree ("state");
CREATE INDEX IF NOT EXISTS "repo_pull_request_repoId_idx" ON "repo_pull_request" USING btree ("repo_id");
CREATE INDEX IF NOT EXISTS "repo_pull_request_state_idx" ON "repo_pull_request" USING btree ("state");

-- Clean slate: remove ONLY the old board-scoped GitHub/Gitea task links.
-- Other providers' external links are unrelated and must survive this migration.
DELETE FROM "external_link"
WHERE "integration_id" IN (
  SELECT "id" FROM "integration" WHERE "type" IN ('github', 'gitea')
);
DELETE FROM "integration" WHERE "type" IN ('github', 'gitea');
