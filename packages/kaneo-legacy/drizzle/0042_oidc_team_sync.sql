ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'kaneo' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oidc_team_sync_config" (
	"organization_id" text PRIMARY KEY NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
	"claim_path" text DEFAULT 'roles' NOT NULL,
	"role_mappings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
