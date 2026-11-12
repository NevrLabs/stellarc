-- Per-attempt context receipt (NEVR-624, Multica #10426 pattern): one row per
-- context source each attempt received, written in the same transaction as
-- task-started. METADATA ONLY by construction — kind, name (skill/MCP-server
-- name or label), size, 12-char SHA-256 prefix, delivery, confidence — never
-- the source content, never MCP commands/URLs/env. The org log carries the
-- same facts as agents:context-receipt events; this table is the query
-- projection (replay folds the events back into this shape).
CREATE TABLE agent_task_context_receipt (
  org text NOT NULL CHECK (length(org) > 0),
  task_id text NOT NULL REFERENCES agent_task(id),
  attempt integer NOT NULL CHECK (attempt > 0),
  position integer NOT NULL CHECK (position >= 0),
  kind text NOT NULL CHECK (kind IN ('instructions', 'prompt', 'resume-digest', 'mcp-server', 'file', 'other')),
  name text NOT NULL CHECK (length(name) > 0),
  bytes integer NOT NULL CHECK (bytes >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{12}$'),
  delivery text NOT NULL CHECK (delivery IN ('inline', 'reference')),
  confidence text NOT NULL CHECK (confidence IN ('seeded', 'referenced', 'unknown')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, attempt, position)
);
