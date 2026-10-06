ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "description_history" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN IF NOT EXISTS "edit_history" jsonb DEFAULT '[]'::jsonb NOT NULL;
