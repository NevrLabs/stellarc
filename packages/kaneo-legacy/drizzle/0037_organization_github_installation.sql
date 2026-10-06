-- GitHub App access belongs to an organization, not to an individual Repo.
-- Repo connection picks from installations linked here; users never type an ID.
CREATE TABLE IF NOT EXISTS "organization_github_installation" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "installation_id" integer NOT NULL,
  "account_id" integer NOT NULL,
  "account_login" text NOT NULL,
  "account_type" text NOT NULL,
  "account_avatar_url" text,
  "repository_selection" text,
  "permissions" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "organization_github_installation_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE cascade ON UPDATE cascade,
  CONSTRAINT "organization_github_installation_unique"
    UNIQUE("organization_id", "installation_id")
);
CREATE INDEX IF NOT EXISTS "organization_github_installation_organizationId_idx"
  ON "organization_github_installation" ("organization_id");

-- Migrate the provider execution detail from existing org-scoped Repos.
-- Account metadata is refreshed when an admin opens GitHub settings.
INSERT INTO "organization_github_installation" (
  "id", "organization_id", "installation_id", "account_id", "account_login", "account_type", "created_at", "updated_at"
)
SELECT
  'legacy-' || r."organization_id" || '-' || (r."config"->>'installationId'),
  r."organization_id",
  (r."config"->>'installationId')::integer,
  0,
  'Unknown',
  'Unknown',
  now(),
  now()
FROM "repo" r
WHERE r."provider" = 'github'
  AND r."config" ? 'installationId'
  AND (r."config"->>'installationId') ~ '^[0-9]+$'
ON CONFLICT ("organization_id", "installation_id") DO NOTHING;
