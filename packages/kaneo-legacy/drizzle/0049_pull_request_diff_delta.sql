ALTER TABLE "repo_pull_request" ADD COLUMN IF NOT EXISTS "additions" integer;
--> statement-breakpoint
ALTER TABLE "repo_pull_request" ADD COLUMN IF NOT EXISTS "deletions" integer;
--> statement-breakpoint
ALTER TABLE "repo_pull_request" ADD COLUMN IF NOT EXISTS "changed_files" integer;
