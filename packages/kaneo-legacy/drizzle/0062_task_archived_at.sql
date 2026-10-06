-- #226: Archive becomes orthogonal to status.
--
-- Before this migration `archived` was itself a *status*, which destroyed the
-- ticket's real state: archiving a Done ticket made it indistinguishable from an
-- archived To Do one. Per the ticket correction: "Archive is a separate status to
-- hide it from all views. Archived item retains its status."
--
-- So archival becomes a timestamp flag, exactly like the existing
-- `board.archived_at`, and `status` is left to mean only workflow state.
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;

-- Partial index: every list endpoint filters `archived_at IS NULL`, and only a
-- tiny fraction of rows are archived, so indexing just the archived ones keeps
-- the index small while still serving the backlog's archived dropdown.
CREATE INDEX IF NOT EXISTS "task_archived_at_idx"
  ON "task" ("archived_at")
  WHERE "archived_at" IS NOT NULL;

-- Carry the 2 existing rows over. Their original status is NOT recoverable --
-- it was overwritten by 'archived' under the old design -- so they land on the
-- table default ('to-do'), which is the neutral choice and keeps them visible
-- in the backlog's archived dropdown rather than vanishing.
UPDATE "task"
   SET "archived_at" = COALESCE("archived_at", "updated_at", now()),
       "status" = 'to-do'
 WHERE "status" = 'archived';
