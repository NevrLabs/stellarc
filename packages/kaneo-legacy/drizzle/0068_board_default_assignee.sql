ALTER TABLE "board"
ADD COLUMN "default_assignee_id" text
REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "board"
ADD COLUMN "default_assignee_team_id" text
REFERENCES "team" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
