CREATE TABLE IF NOT EXISTS "milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"due_date" timestamp,
	"status" text DEFAULT 'planned' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "milestone_board_id_name_unique" UNIQUE("board_id","name")
);
--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "milestone_boardId_idx" ON "milestone" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "milestone_dueDate_idx" ON "milestone" USING btree ("due_date");--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "milestone_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_milestone_id_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestone"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_milestoneId_idx" ON "task" USING btree ("milestone_id");
