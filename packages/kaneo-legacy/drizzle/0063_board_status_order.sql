-- #226: per-board ordering for the status choices shown in Tasks and Backlog.
--
-- JSONB arrays keep this deliberately simple: the vocabulary is global and
-- append-only; boards only persist the ordered slugs. New statuses omitted from
-- an older board's array are appended in canonical order by the reader, so
-- adding a future status can never make it disappear from configured boards.
ALTER TABLE "board"
  ADD COLUMN IF NOT EXISTS "task_status_order" jsonb
  NOT NULL DEFAULT '["to-do","in-progress","in-review","done","canceled","duplicate"]'::jsonb;

ALTER TABLE "board"
  ADD COLUMN IF NOT EXISTS "backlog_status_order" jsonb
  NOT NULL DEFAULT '["triage","planned"]'::jsonb;

-- Existing boards receive the ticket's canonical defaults. Triage is above
-- Planned, verbatim from the requirement.
UPDATE "board"
   SET "task_status_order" = '["to-do","in-progress","in-review","done","canceled","duplicate"]'::jsonb
 WHERE "task_status_order" IS NULL;

UPDATE "board"
   SET "backlog_status_order" = '["triage","planned"]'::jsonb
 WHERE "backlog_status_order" IS NULL;

-- Each field is an array, not an object/string. Slug membership/uniqueness is
-- validated by the API because the vocabulary evolves independently of schema.
ALTER TABLE "board" DROP CONSTRAINT IF EXISTS "board_task_status_order_is_array";
ALTER TABLE "board"
  ADD CONSTRAINT "board_task_status_order_is_array"
  CHECK (jsonb_typeof("task_status_order") = 'array');

ALTER TABLE "board" DROP CONSTRAINT IF EXISTS "board_backlog_status_order_is_array";
ALTER TABLE "board"
  ADD CONSTRAINT "board_backlog_status_order_is_array"
  CHECK (jsonb_typeof("backlog_status_order") = 'array');

ALTER TABLE "board" DROP CONSTRAINT IF EXISTS "board_task_status_order_max_items";
ALTER TABLE "board"
  ADD CONSTRAINT "board_task_status_order_max_items"
  CHECK (jsonb_array_length("task_status_order") <= 64);

ALTER TABLE "board" DROP CONSTRAINT IF EXISTS "board_backlog_status_order_max_items";
ALTER TABLE "board"
  ADD CONSTRAINT "board_backlog_status_order_max_items"
  CHECK (jsonb_array_length("backlog_status_order") <= 64);

-- Read-side canonicalization handles unknown/omitted values. Duplicate and
-- unknown slugs are rejected by the API: PostgreSQL forbids the subquery needed
-- to express array uniqueness inside a CHECK constraint.
