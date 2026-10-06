-- Sub-teams: a team may nest under another team in the same organization.
--
-- Membership resolves TRANSITIVELY at query time (a member of a sub-team
-- counts as a member of every ancestor team) — no team_member rows are
-- materialized for ancestors, so leaving a sub-team cannot strand stale
-- parent rows.
--
-- ON DELETE SET NULL: deleting a parent promotes its children to top-level
-- teams rather than cascading them away.
ALTER TABLE "team" ADD COLUMN "parent_team_id" text;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_parent_team_id_team_id_fk" FOREIGN KEY ("parent_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_parentTeamId_idx" ON "team" USING btree ("parent_team_id");
