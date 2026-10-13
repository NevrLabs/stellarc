-- Agent memory (NEVR-179): event-log-derived memory artifacts with distill
-- runs and a workspace off-switch. The org event log (agents:memory_*) is the
-- source of truth; agent_memory is a projection rebuilt by replaying events
-- (applyMemoryEvent is its only writer) and never holds unique state.
CREATE TABLE org_policy (
  org text PRIMARY KEY CHECK (length(org) > 0),
  memory_enabled boolean NOT NULL DEFAULT true,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agent_task ADD COLUMN task_type text NOT NULL DEFAULT 'run'
  CHECK (task_type IN ('run', 'memory.distill'));
ALTER TABLE agent_task_item DROP CONSTRAINT agent_task_item_kind_check;
ALTER TABLE agent_task_item ADD CONSTRAINT agent_task_item_kind_check
  CHECK (kind IN ('message', 'thinking', 'tool_call', 'tool_result', 'file_change', 'approval', 'checkpoint', 'config', 'harness_meta', 'memory_write'));
CREATE TABLE agent_memory (
  id text PRIMARY KEY,
  org text NOT NULL CHECK (length(org) > 0),
  agent_id text NOT NULL REFERENCES agent(id),
  kind text NOT NULL CHECK (kind IN ('fact', 'preference', 'skill', 'summary', 'correction')),
  content text NOT NULL CHECK (length(content) > 0 AND length(content) <= 2000),
  content_hash text NOT NULL,
  source text NOT NULL DEFAULT 'distill',
  source_task_id text REFERENCES agent_task(id),
  created_seq bigint NOT NULL CHECK (created_seq > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_seq bigint
);
CREATE UNIQUE INDEX agent_memory_live_hash_idx ON agent_memory (agent_id, content_hash) WHERE deleted_at IS NULL;
CREATE INDEX agent_memory_live_idx ON agent_memory (org, agent_id, created_seq) WHERE deleted_at IS NULL;
