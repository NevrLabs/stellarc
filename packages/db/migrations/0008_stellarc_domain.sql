-- Stellarc working domain (NEVR-430, ADR 0014 §Decision 1): the boards,
-- tickets, projects and their social data, designed for Stellarc — not Kaneo
-- wire parity. Kaneo rows arrive later through the one-shot import, keyed by
-- import_source (the Kaneo row id); rows born in Stellarc keep it NULL.
--
-- Org scoping rides on identity: every table carries org_id REFERENCES
-- organization(id), and link tables additionally pin their targets to the
-- same org with composite foreign keys ((id, org_id)), so no row can ever
-- point at another org's data. Assignee/author/actor columns reference
-- principal(id) — the identity table that covers both humans and agents.

CREATE TABLE board (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) > 0),
  description text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  import_source text,
  created_by text NOT NULL REFERENCES principal(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (org_id, name),
  UNIQUE (id, org_id)
);
CREATE INDEX board_org_idx ON board (org_id, position) WHERE archived_at IS NULL;

-- Statuses are board-scoped (Kaneo column → Stellarc status): each board
-- defines its own workflow. UNIQUE (id, board_id) lets a ticket pin its
-- board and status in one composite foreign key, so a ticket can never sit
-- in another board's status.
CREATE TABLE status (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  board_id text NOT NULL,
  name text NOT NULL CHECK (length(name) > 0),
  color text CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  import_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, name),
  UNIQUE (id, board_id),
  UNIQUE (id, org_id),
  FOREIGN KEY (board_id, org_id) REFERENCES board(id, org_id) ON DELETE CASCADE
);
CREATE INDEX status_board_idx ON status (board_id, position);

CREATE TABLE milestone (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  board_id text NOT NULL,
  name text NOT NULL CHECK (length(name) > 0),
  description text NOT NULL DEFAULT '',
  due_date date,
  completed_at timestamptz,
  import_source text,
  created_by text NOT NULL REFERENCES principal(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, name),
  UNIQUE (id, org_id),
  FOREIGN KEY (board_id, org_id) REFERENCES board(id, org_id) ON DELETE CASCADE
);

CREATE TABLE ticket (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  board_id text NOT NULL,
  status_id text NOT NULL,
  key text NOT NULL CHECK (length(key) > 0),
  number integer NOT NULL CHECK (number > 0),
  title text NOT NULL CHECK (length(title) > 0),
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'none'
    CHECK (priority IN ('urgent', 'high', 'medium', 'low', 'none')),
  assignee_principal_id text REFERENCES principal(id),
  milestone_id text,
  start_date date,
  due_date date,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  import_source text,
  created_by text NOT NULL REFERENCES principal(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_org_key_number_unique UNIQUE (org_id, key, number),
  UNIQUE (id, org_id),
  UNIQUE (id, board_id),
  FOREIGN KEY (board_id, org_id) REFERENCES board(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (status_id, board_id) REFERENCES status(id, board_id),
  FOREIGN KEY (milestone_id, org_id) REFERENCES milestone(id, org_id),
  CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
);
CREATE INDEX ticket_board_status_idx ON ticket (board_id, status_id, position);
CREATE INDEX ticket_assignee_idx ON ticket (org_id, assignee_principal_id);
CREATE INDEX ticket_milestone_idx ON ticket (milestone_id);
CREATE INDEX ticket_board_updated_idx ON ticket (board_id, updated_at);

CREATE TABLE ticket_relation (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  ticket_id text NOT NULL,
  related_ticket_id text NOT NULL,
  relation text NOT NULL
    CHECK (relation IN ('blocks', 'blocked_by', 'relates_to', 'duplicates')),
  import_source text,
  created_by text NOT NULL REFERENCES principal(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, related_ticket_id, relation),
  CHECK (ticket_id <> related_ticket_id),
  FOREIGN KEY (ticket_id, org_id) REFERENCES ticket(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (related_ticket_id, org_id) REFERENCES ticket(id, org_id) ON DELETE CASCADE
);
CREATE INDEX ticket_relation_related_idx ON ticket_relation (related_ticket_id);

CREATE TABLE label (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) > 0),
  color text CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
  import_source text,
  created_by text NOT NULL REFERENCES principal(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name),
  UNIQUE (id, org_id)
);
CREATE INDEX label_org_idx ON label (org_id);

CREATE TABLE ticket_label (
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  ticket_id text NOT NULL,
  label_id text NOT NULL,
  import_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, label_id),
  FOREIGN KEY (ticket_id, org_id) REFERENCES ticket(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (label_id, org_id) REFERENCES label(id, org_id) ON DELETE CASCADE
);
CREATE INDEX ticket_label_label_idx ON ticket_label (label_id);

-- Projects are outcome tracking that groups boards (Kaneo project_* →
-- Stellarc project), parallel to boards rather than above them.
CREATE TABLE project (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) > 0),
  description text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  import_source text,
  created_by text NOT NULL REFERENCES principal(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (org_id, name),
  UNIQUE (id, org_id)
);
CREATE INDEX project_org_idx ON project (org_id, position) WHERE archived_at IS NULL;

CREATE TABLE project_board (
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  board_id text NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  import_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, board_id),
  FOREIGN KEY (project_id, org_id) REFERENCES project(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (board_id, org_id) REFERENCES board(id, org_id) ON DELETE CASCADE
);
CREATE INDEX project_board_board_idx ON project_board (board_id);

CREATE TABLE comment (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  ticket_id text NOT NULL,
  body text NOT NULL CHECK (length(body) > 0),
  import_source text,
  created_by text NOT NULL REFERENCES principal(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id),
  FOREIGN KEY (ticket_id, org_id) REFERENCES ticket(id, org_id) ON DELETE CASCADE
);
CREATE INDEX comment_ticket_idx ON comment (ticket_id, created_at);

-- Activity is the typed feed (Kaneo activity): what happened, who did it,
-- free-form type vocabulary owned by the API layer, payload jsonb for the
-- details. ticket_id NULL = org-level activity.
CREATE TABLE activity (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  ticket_id text,
  type text NOT NULL CHECK (length(type) > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_source text,
  actor_principal_id text REFERENCES principal(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id),
  FOREIGN KEY (ticket_id, org_id) REFERENCES ticket(id, org_id) ON DELETE CASCADE
);
CREATE INDEX activity_ticket_idx ON activity (ticket_id, created_at);
CREATE INDEX activity_org_idx ON activity (org_id, created_at);

-- Subscriptions (Kaneo task_follower): a principal watching a ticket.
CREATE TABLE subscriber (
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  ticket_id text NOT NULL,
  principal_id text NOT NULL REFERENCES principal(id),
  import_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, principal_id),
  FOREIGN KEY (ticket_id, org_id) REFERENCES ticket(id, org_id) ON DELETE CASCADE
);
CREATE INDEX subscriber_principal_idx ON subscriber (principal_id);

-- Resource grants (Kaneo resource_grant): what a principal may do with a
-- board or a project. The capability vocabulary follows the identity
-- organization.default_resource_privilege family; later resources (repo,
-- …) extend resource_type with their own migration.
CREATE TABLE "grant" (
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  principal_id text NOT NULL REFERENCES principal(id),
  resource_type text NOT NULL CHECK (resource_type IN ('board', 'project')),
  resource_id text NOT NULL CHECK (length(resource_id) > 0),
  capability text NOT NULL CHECK (capability IN ('view', 'edit', 'manage')),
  import_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, principal_id, resource_type, resource_id, capability)
);
CREATE INDEX grant_resource_idx ON "grant" (org_id, resource_type, resource_id);
