-- 0004_activity_notifications — STL-17 (spec §2 exact contracts)
-- Cross-slice FKs to board/task/status are deferred to the STL-16 integration
-- merge (those tables do not exist on dev yet); see .forge-question.md Q1.

CREATE TABLE comment (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  ticket_id text NOT NULL,
  type text NOT NULL DEFAULT 'comment' CHECK (type = 'comment'),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  user_id text REFERENCES "user"(id) ON DELETE SET NULL,
  content text,
  edit_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  event_data jsonb,
  external_user_name text,
  external_user_avatar text,
  external_source text,
  external_url text,
  CONSTRAINT comment_external_unique UNIQUE (ticket_id, external_source, external_url)
);
CREATE INDEX comment_ticket_created_idx ON comment (ticket_id, created_at, id);

CREATE TABLE activity_projection (
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  id text NOT NULL,
  ticket_id text NOT NULL,
  type text NOT NULL,
  created_at timestamp without time zone NOT NULL,
  updated_at timestamp without time zone NOT NULL,
  user_id text REFERENCES "user"(id) ON DELETE SET NULL,
  content text,
  edit_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  event_data jsonb,
  external_user_name text,
  external_user_avatar text,
  external_source text,
  external_url text,
  last_seq bigint NOT NULL,
  PRIMARY KEY (org_id, id)
);
CREATE INDEX activity_projection_ticket_idx ON activity_projection (org_id, ticket_id, created_at, id);

CREATE TABLE notification (
  id text PRIMARY KEY,
  org_id text REFERENCES organization(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title text,
  content text,
  type text NOT NULL DEFAULT 'info',
  event_data jsonb,
  is_read boolean DEFAULT false,
  resource_id text,
  resource_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_org text,
  source_seq bigint,
  delivery_key text UNIQUE
);
CREATE INDEX notification_inbox_idx ON notification (user_id, org_id, created_at, id);

CREATE TABLE workflow_rule (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  board_id text NOT NULL,
  integration_type text NOT NULL,
  event_type text NOT NULL,
  status_id text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflow_rule_target_unique UNIQUE (board_id, integration_type, event_type)
);
CREATE INDEX workflow_rule_board_idx ON workflow_rule (board_id);

CREATE TABLE user_notification_preference (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  ntfy_enabled boolean NOT NULL DEFAULT false,
  ntfy_server_url text,
  ntfy_topic text,
  ntfy_token text,
  gotify_enabled boolean NOT NULL DEFAULT false,
  gotify_server_url text,
  gotify_token text,
  webhook_enabled boolean NOT NULL DEFAULT false,
  webhook_url text,
  webhook_secret text,
  task_assignment_enabled boolean NOT NULL DEFAULT true,
  task_comment_enabled boolean NOT NULL DEFAULT true,
  task_status_change_enabled boolean NOT NULL DEFAULT true,
  due_date_reminder_enabled boolean NOT NULL DEFAULT true,
  due_date_reminder_lead_time_minutes integer NOT NULL DEFAULT 1440
    CONSTRAINT unp_lead_time_check CHECK (due_date_reminder_lead_time_minutes >= 5 AND due_date_reminder_lead_time_minutes <= 43200),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE user_notification_org_rule (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  ntfy_enabled boolean NOT NULL DEFAULT false,
  gotify_enabled boolean NOT NULL DEFAULT false,
  webhook_enabled boolean NOT NULL DEFAULT false,
  board_mode text NOT NULL DEFAULT 'all' CHECK (board_mode IN ('all','selected')),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT unor_user_org_unique UNIQUE (user_id, organization_id),
  CONSTRAINT unor_org_id_unique UNIQUE (organization_id, id)
);
CREATE INDEX unor_user_idx ON user_notification_org_rule (user_id);
CREATE INDEX unor_org_idx ON user_notification_org_rule (organization_id);

CREATE TABLE user_notification_org_board (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  org_rule_id text NOT NULL,
  board_id text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT unob_rule_fk FOREIGN KEY (organization_id, org_rule_id)
    REFERENCES user_notification_org_rule(organization_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT unob_rule_board_unique UNIQUE (org_rule_id, board_id)
);
-- (organization_id, board_id) -> board(organization_id, id) arrives with the
-- STL-16 board table; enforced at the service seam until then (question Q1).
CREATE INDEX unob_rule_idx ON user_notification_org_board (org_rule_id);
CREATE INDEX unob_board_idx ON user_notification_org_board (board_id);
CREATE INDEX unob_org_board_idx ON user_notification_org_board (organization_id, board_id);

CREATE TABLE notification_outbox (
  id text PRIMARY KEY,
  org_id text NOT NULL,
  event_seq bigint NOT NULL,
  consumer text NOT NULL DEFAULT 'inbox-v1',
  traceparent text,
  tracestate text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','complete','dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_event_fk FOREIGN KEY (org_id, event_seq) REFERENCES event(org, seq) ON DELETE CASCADE,
  CONSTRAINT outbox_job_unique UNIQUE (org_id, event_seq, consumer)
);
CREATE INDEX outbox_pending_idx ON notification_outbox (state, available_at);

CREATE TABLE activity_import (
  source_id text NOT NULL,
  table_name text NOT NULL,
  source_pk text NOT NULL,
  digest text NOT NULL,
  destination_id text NOT NULL,
  destination_org text,
  destination_seq bigint,
  PRIMARY KEY (source_id, table_name, source_pk)
);
