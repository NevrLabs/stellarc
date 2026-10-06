-- Upstream cherry-pick (8b88c7d7): position column for legacy "project" table.
-- Fork-defensive rewrite (v3.2.0, KFL board): the fork renamed project->board in
-- 0035_terminology_rename.sql, so fork databases created after that rename have no
-- "project" table and the original unconditional ALTER crashed the migration chain
-- (startup migrate() failure). Guards make this a no-op where the legacy table is
-- absent and idempotent where it was already applied (drizzle re-runs on content
-- hash change). Never shipped in a fork release tag before this rewrite.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='project') THEN
    ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='project_workspaceId_position_idx') THEN
      CREATE INDEX "project_workspaceId_position_idx" ON "project" USING btree ("workspace_id","position");
    END IF;
    UPDATE "project" p SET "position" = sub.rn
    FROM (
      SELECT "id", row_number() OVER (PARTITION BY "workspace_id" ORDER BY "created_at", "id") - 1 AS rn
      FROM "project"
    ) sub
    WHERE p."id" = sub."id" AND p."position" = 0;
  END IF;
END $$;
