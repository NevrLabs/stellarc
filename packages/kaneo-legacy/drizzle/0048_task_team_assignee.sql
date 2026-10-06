ALTER TABLE "task" ADD COLUMN "team_assignee_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_team_assignee_id_team_id_fk" FOREIGN KEY ("team_assignee_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_teamAssigneeId_idx" ON "task" USING btree ("team_assignee_id");
