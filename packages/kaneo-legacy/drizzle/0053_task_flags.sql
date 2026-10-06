CREATE TABLE IF NOT EXISTS "flag_type" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"icon" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "flag_type_board_id_name_unique" UNIQUE("board_id","name")
);
--> statement-breakpoint
ALTER TABLE "flag_type" ADD CONSTRAINT "flag_type_board_id_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flag_type_boardId_idx" ON "flag_type" USING btree ("board_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_flag" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"flag_type_id" text NOT NULL,
	"flagged_by" text,
	"target_user_id" text,
	"target_team_id" text,
	"note" text,
	"resolved_at" timestamp,
	"resolved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_flag" ADD CONSTRAINT "task_flag_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_flag" ADD CONSTRAINT "task_flag_flag_type_id_flag_type_id_fk" FOREIGN KEY ("flag_type_id") REFERENCES "public"."flag_type"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_flag" ADD CONSTRAINT "task_flag_flagged_by_user_id_fk" FOREIGN KEY ("flagged_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_flag" ADD CONSTRAINT "task_flag_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_flag" ADD CONSTRAINT "task_flag_target_team_id_team_id_fk" FOREIGN KEY ("target_team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_flag" ADD CONSTRAINT "task_flag_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flag_taskId_idx" ON "task_flag" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flag_flagTypeId_idx" ON "task_flag" USING btree ("flag_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flag_targetUserId_idx" ON "task_flag" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flag_targetTeamId_idx" ON "task_flag" USING btree ("target_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flag_resolvedAt_idx" ON "task_flag" USING btree ("resolved_at");
