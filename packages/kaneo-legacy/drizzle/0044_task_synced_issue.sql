ALTER TABLE "task_repo_item_link"
  ADD COLUMN IF NOT EXISTS "sync_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "sync_broken_at" timestamp,
  ADD COLUMN IF NOT EXISTS "sync_broken_reason" text;

CREATE UNIQUE INDEX IF NOT EXISTS "task_single_synced_issue_idx"
  ON "task_repo_item_link" ("task_id")
  WHERE "sync_enabled";

DO $$ BEGIN
  ALTER TABLE "task_repo_item_link"
    ADD CONSTRAINT "task_repo_item_link_sync_issue_only"
    CHECK (NOT "sync_enabled" OR "repo_issue_id" IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
