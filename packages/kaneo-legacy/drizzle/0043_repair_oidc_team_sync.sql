ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'kaneo' NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.oidc_team_sync_config') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'oidc_team_sync_config'
         AND column_name = 'organization_id'
     ) THEN
    ALTER TABLE "oidc_team_sync_config"
      RENAME TO "oidc_team_sync_config_legacy_global";
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oidc_team_sync_config" (
  "organization_id" text PRIMARY KEY NOT NULL,
  "claim_path" text DEFAULT 'roles' NOT NULL,
  "role_mappings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "oidc_team_sync_config_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE cascade ON UPDATE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oidc_team_sync_config_organization_idx"
  ON "oidc_team_sync_config" USING btree ("organization_id");
