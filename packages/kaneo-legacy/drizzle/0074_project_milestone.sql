CREATE TABLE IF NOT EXISTS "project_milestone" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "project"("id") ON DELETE cascade ON UPDATE cascade,
  "name" text NOT NULL,
  "description" text,
  "target_date" text,
  "rank" integer DEFAULT 0 NOT NULL,
  "completed_at" timestamp,
  "completed_by" text REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_milestone_completion_pair_check" CHECK (("completed_at" IS NULL) = ("completed_by" IS NULL)),
  CONSTRAINT "project_milestone_project_id_id_unique" UNIQUE("project_id", "id")
);
CREATE INDEX IF NOT EXISTS "project_milestone_project_rank_created_idx" ON "project_milestone" ("project_id", "rank", "created_at");
CREATE INDEX IF NOT EXISTS "project_milestone_completed_by_idx" ON "project_milestone" ("completed_by");
ALTER TABLE "project_ticket" ADD COLUMN IF NOT EXISTS "project_milestone_id" text REFERENCES "project_milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "project_ticket_project_milestone_rank_idx" ON "project_ticket" ("project_id", "project_milestone_id", "rank");
