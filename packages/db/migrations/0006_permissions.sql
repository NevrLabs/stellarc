-- Scoped permissions (NEVR-198): the blanket allow_once answer is replaced by
-- an agent-level permission policy; non-allowlisted tool calls park the task
-- for a human decision instead of silently proceeding.
--
-- needs_permission is a parked state like budget_exhausted (NEVR-178), but the
-- gate is a human decision, not a window reset: excluded from claims, no
-- attempt burn, no failure_code. Unlike budget parking, the node KEEPS the
-- lease and holds the ACP session open, so a grant resumes the same native
-- session in place (attempt and native_session_id unchanged).
ALTER TABLE agent_task DROP CONSTRAINT IF EXISTS agent_task_status_check;
ALTER TABLE agent_task ADD CONSTRAINT agent_task_status_check
  CHECK (status IN ('queued', 'claimed', 'running', 'completed', 'failed', 'cancelled', 'budget_exhausted', 'needs_permission'));

-- A parked task KEEPS its lease and native session (the node holds the ACP
-- session open; resume reuses it), so needs_permission joins claimed/running
-- in the lease-presence check. The original unnamed table CHECK gets
-- Postgres' auto-generated name (agent_task_check).
ALTER TABLE agent_task DROP CONSTRAINT IF EXISTS agent_task_check;
ALTER TABLE agent_task ADD CONSTRAINT agent_task_check
  CHECK ((status IN ('claimed', 'running', 'needs_permission')) = (lease_until IS NOT NULL));

-- The operator verdict once a parked permission request is resolved; NULL
-- while no decision has been made. 'granted' is consumed exactly once (the
-- heartbeat delivers it and clears the flag); 'denied' is terminal.
ALTER TABLE agent_task ADD COLUMN permission_decision text
  CHECK (permission_decision IS NULL OR permission_decision IN ('granted', 'denied'));

-- Agent-level permission policy (first cut: agent scope only). NULL preserves
-- the legacy behaviour exactly — every request auto-allowed — so existing
-- agents are unaffected by this migration.
ALTER TABLE agent ADD COLUMN permission_policy jsonb;
