ALTER TABLE "team" ADD COLUMN "member_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "team_member" ADD COLUMN "membership_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "team_member_membership_key_unique" ON "team_member" USING btree ("membership_key");
