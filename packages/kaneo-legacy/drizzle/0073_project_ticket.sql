CREATE TABLE IF NOT EXISTS "project_ticket" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "project"("id") ON DELETE cascade ON UPDATE cascade,
  "task_id" text NOT NULL REFERENCES "task"("id") ON DELETE cascade ON UPDATE cascade,
  "rank" integer DEFAULT 0 NOT NULL,
  "added_by" text NOT NULL REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade,
  "added_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_ticket_task_unique" UNIQUE("task_id"),
  CONSTRAINT "project_ticket_project_task_unique" UNIQUE("project_id", "task_id")
);
CREATE INDEX IF NOT EXISTS "project_ticket_project_rank_idx" ON "project_ticket" ("project_id", "rank");
CREATE INDEX IF NOT EXISTS "project_ticket_task_idx" ON "project_ticket" ("task_id");
