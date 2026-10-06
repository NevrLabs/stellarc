ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "deleted_by" text;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_deletedAt_idx" ON "task" USING btree ("deleted_at");--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "trash_retention_days" integer DEFAULT 30 NOT NULL;
