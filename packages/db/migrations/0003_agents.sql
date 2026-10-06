-- Agents plugin (A1): bring-your-own-agent runtime nodes, agents, task queue,
-- transcript items. Inert CP (D4): the plane stores desired state + node claims;
-- harness launch commands live on the node, never here.
CREATE TABLE agent_node (
  id text PRIMARY KEY,
  org text NOT NULL CHECK (length(org) > 0),
  name text NOT NULL CHECK (length(name) > 0),
  token_hash text NOT NULL UNIQUE,
  harnesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  version text,
  last_seen_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (org, name)
);
CREATE TABLE agent (
  id text PRIMARY KEY,
  org text NOT NULL CHECK (length(org) > 0),
  name text NOT NULL CHECK (length(name) > 0),
  node_id text NOT NULL REFERENCES agent_node(id),
  harness text NOT NULL CHECK (length(harness) > 0),
  model text,
  instructions text NOT NULL DEFAULT '',
  mcp_servers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (org, name)
);
CREATE TABLE agent_task (
  id text PRIMARY KEY,
  org text NOT NULL CHECK (length(org) > 0),
  agent_id text NOT NULL REFERENCES agent(id),
  subject_ref text,
  prompt text NOT NULL CHECK (length(prompt) > 0),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'running', 'completed', 'failed', 'cancelled')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  node_id text REFERENCES agent_node(id),
  lease_until timestamptz,
  stop_reason text,
  failure_code text,
  failure_message text,
  native_session_id text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status IN ('claimed', 'running')) = (lease_until IS NOT NULL)),
  CHECK (failure_code IS NULL OR failure_code ~ '^(platform|agent_error)\.[a-z_]+$')
);
CREATE INDEX agent_task_queue_idx ON agent_task (agent_id, created_at) WHERE status = 'queued';
CREATE INDEX agent_task_lease_idx ON agent_task (lease_until) WHERE status IN ('claimed', 'running');
-- Transcript items are node claims (D14): ACP-shaped normalized view only; raw
-- wire stays in the node journal (D21). Dedupe on (task, attempt, node seq).
CREATE TABLE agent_task_item (
  org text NOT NULL,
  task_id text NOT NULL REFERENCES agent_task(id),
  attempt integer NOT NULL,
  seq integer NOT NULL CHECK (seq >= 0),
  kind text NOT NULL CHECK (kind IN ('message', 'thinking', 'tool_call', 'tool_result', 'file_change', 'approval', 'checkpoint', 'config', 'harness_meta')),
  body jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, attempt, seq)
);
