CREATE TABLE "board" (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE ON UPDATE CASCADE,
  slug text NOT NULL,
  icon text DEFAULT 'Layout',
  name text NOT NULL,
  description text,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  is_public boolean DEFAULT false,
  archived_at timestamp without time zone,
  last_task_number integer NOT NULL DEFAULT 0,
  org_privilege text,
  task_status_order jsonb NOT NULL DEFAULT '["to-do","in-progress","in-review","done","canceled","duplicate"]'::jsonb,
  backlog_status_order jsonb NOT NULL DEFAULT '["triage","planned"]'::jsonb,
  subtask_depth_limit integer NOT NULL DEFAULT 4,
  default_assignee_id text REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE CASCADE,
  default_assignee_team_id text REFERENCES team(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT board_subtask_depth_limit_range CHECK (subtask_depth_limit >= 1 AND subtask_depth_limit <= 4)
);
CREATE UNIQUE INDEX board_organization_key_lower_unique ON "board" (organization_id, lower(slug));
ALTER TABLE "board" ADD CONSTRAINT board_organization_id_id_unique UNIQUE (organization_id, id);
CREATE TABLE board_key_alias (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE ON UPDATE CASCADE,
  board_id text NOT NULL REFERENCES "board"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  key text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX board_key_alias_organization_key_lower_unique ON board_key_alias (organization_id, lower(key));
CREATE INDEX board_key_alias_board_id_idx ON board_key_alias (board_id);
CREATE TABLE "column" (
  id text PRIMARY KEY,
  board_id text NOT NULL REFERENCES "board"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  icon text,
  color text,
  is_final boolean NOT NULL DEFAULT false,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);
CREATE INDEX column_boardId_idx ON "column" (board_id);
CREATE TABLE task (
  id text PRIMARY KEY,
  board_id text NOT NULL REFERENCES "board"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  position integer DEFAULT 0,
  number integer DEFAULT 1,
  assignee_id text REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE CASCADE,
  team_assignee_id text REFERENCES team(id) ON DELETE SET NULL ON UPDATE CASCADE,
  title text NOT NULL,
  description text,
  description_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'to-do',
  column_id text REFERENCES "column"(id) ON DELETE SET NULL ON UPDATE CASCADE,
  priority text DEFAULT 'low',
  milestone_id text,
  archived_at timestamp without time zone,
  archived_by text REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE CASCADE,
  deleted_at timestamp without time zone,
  deleted_by text REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE CASCADE,
  start_date timestamp without time zone,
  due_date timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);
CREATE INDEX task_boardId_idx ON task (board_id);
CREATE INDEX task_dueDate_idx ON task (due_date);
CREATE INDEX task_assigneeId_idx ON task (assignee_id);
CREATE INDEX task_teamAssigneeId_idx ON task (team_assignee_id);
CREATE INDEX task_columnId_idx ON task (column_id);
ALTER TABLE task ADD CONSTRAINT task_board_number_unique UNIQUE (board_id, number);
CREATE TABLE label (
  id text PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL,
  source text NOT NULL DEFAULT 'kaneo' CHECK (source IN ('kaneo','repo')),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  task_id text REFERENCES task(id) ON DELETE CASCADE ON UPDATE CASCADE,
  organization_id text REFERENCES organization(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX label_task_id_idx ON label (task_id);
CREATE INDEX label_organization_id_idx ON label (organization_id);
ALTER TABLE label ADD CONSTRAINT label_task_name_unique UNIQUE (task_id, name);
CREATE UNIQUE INDEX label_organization_name_unique ON label (organization_id, name) WHERE task_id IS NULL;
CREATE TABLE task_template (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);
CREATE INDEX task_template_organization_id_idx ON task_template (organization_id);
ALTER TABLE task_template ADD CONSTRAINT task_template_organization_name_unique UNIQUE (organization_id, name);
CREATE TABLE flag_type (
  id text PRIMARY KEY,
  board_id text NOT NULL REFERENCES "board"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name text NOT NULL,
  color text,
  icon text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);
CREATE INDEX flag_type_boardId_idx ON flag_type (board_id);
ALTER TABLE flag_type ADD CONSTRAINT flag_type_board_id_name_unique UNIQUE (board_id, name);
CREATE TABLE task_flag (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES task(id) ON DELETE CASCADE ON UPDATE CASCADE,
  flag_type_id text NOT NULL REFERENCES flag_type(id) ON DELETE CASCADE ON UPDATE CASCADE,
  flagged_by text REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE CASCADE,
  target_user_id text REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  target_team_id text REFERENCES team(id) ON DELETE CASCADE ON UPDATE CASCADE,
  note text,
  resolve_note text,
  resolved_at timestamp without time zone,
  resolved_by text REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);
CREATE INDEX task_flag_taskId_idx ON task_flag (task_id);
CREATE INDEX task_flag_flagTypeId_idx ON task_flag (flag_type_id);
CREATE INDEX task_flag_targetUserId_idx ON task_flag (target_user_id);
CREATE INDEX task_flag_targetTeamId_idx ON task_flag (target_team_id);
CREATE INDEX task_flag_resolvedAt_idx ON task_flag (resolved_at);
CREATE TABLE work_import (
  source_id text NOT NULL,
  table_name text NOT NULL,
  source_pk text NOT NULL,
  digest text NOT NULL,
  PRIMARY KEY (source_id, table_name, source_pk)
);
