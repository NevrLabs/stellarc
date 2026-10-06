ALTER TABLE "board" ADD COLUMN IF NOT EXISTS "subtask_depth_limit" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "board" ADD CONSTRAINT "board_subtask_depth_limit_range" CHECK ("subtask_depth_limit" >= 1 AND "subtask_depth_limit" <= 4);
