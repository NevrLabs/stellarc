CREATE TABLE IF NOT EXISTS "task_follower" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_follower_task_user_unique" UNIQUE("task_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_follower" ADD CONSTRAINT "task_follower_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_follower" ADD CONSTRAINT "task_follower_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_follower_task_idx" ON "task_follower" ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_follower_user_idx" ON "task_follower" ("user_id");
