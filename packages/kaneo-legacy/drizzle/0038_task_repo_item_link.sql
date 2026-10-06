-- Links preserve independent Repo and Task ownership; they are not task conversions.
CREATE TABLE IF NOT EXISTS "task_repo_item_link" (
  "id" text PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL,
  "repo_issue_id" text,
  "repo_pull_request_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "task_repo_item_link_task_id_task_id_fk"
    FOREIGN KEY ("task_id") REFERENCES "public"."task"("id")
    ON DELETE cascade ON UPDATE cascade,
  CONSTRAINT "task_repo_item_link_repo_issue_id_repo_issue_id_fk"
    FOREIGN KEY ("repo_issue_id") REFERENCES "public"."repo_issue"("id")
    ON DELETE cascade ON UPDATE cascade,
  CONSTRAINT "task_repo_item_link_repo_pull_request_id_repo_pull_request_id_fk"
    FOREIGN KEY ("repo_pull_request_id") REFERENCES "public"."repo_pull_request"("id")
    ON DELETE cascade ON UPDATE cascade,
  CONSTRAINT "task_repo_item_link_exactly_one_repo_item"
    CHECK (("repo_issue_id" IS NOT NULL) <> ("repo_pull_request_id" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "task_repo_item_link_task_idx"
  ON "task_repo_item_link" ("task_id");
CREATE INDEX IF NOT EXISTS "task_repo_item_link_issue_idx"
  ON "task_repo_item_link" ("repo_issue_id");
CREATE INDEX IF NOT EXISTS "task_repo_item_link_pull_request_idx"
  ON "task_repo_item_link" ("repo_pull_request_id");
CREATE UNIQUE INDEX IF NOT EXISTS "task_repo_item_link_task_issue_unique"
  ON "task_repo_item_link" ("task_id", "repo_issue_id")
  WHERE "repo_issue_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "task_repo_item_link_task_pull_request_unique"
  ON "task_repo_item_link" ("task_id", "repo_pull_request_id")
  WHERE "repo_pull_request_id" IS NOT NULL;
