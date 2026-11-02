-- Run budgets (NEVR-178): typed per-run usage captured at the node seam, and
-- operator-defined budgets enforced in the claim path. Stellarc is BYO-keys, so
-- budgets are an operator guardrail against runaway spend, never billing (D4:
-- the plane never calls a model; it records only what the harness reported).
--
-- budget_exhausted is a parked state, not a failure: excluded from claims, no
-- attempt burn, no failure_code; resumable automatically on window reset (the
-- claim loop retries) or immediately on an admin raise. Budget parking is a
-- platform-shaped condition and never an agent_error.*.
ALTER TABLE agent_task DROP CONSTRAINT IF EXISTS agent_task_status_check;
ALTER TABLE agent_task ADD CONSTRAINT agent_task_status_check
  CHECK (status IN ('queued', 'claimed', 'running', 'completed', 'failed', 'cancelled', 'budget_exhausted'));

-- ACP usage data (usage_update session updates, harness totals at finish) is
-- typed storage, not a harness_meta blob.
ALTER TABLE agent_task_item DROP CONSTRAINT IF EXISTS agent_task_item_kind_check;
ALTER TABLE agent_task_item ADD CONSTRAINT agent_task_item_kind_check
  CHECK (kind IN ('message', 'thinking', 'tool_call', 'tool_result', 'file_change', 'approval', 'checkpoint', 'config', 'harness_meta', 'usage'));

-- Typed usage per task attempt. Numbers are harness-reported and cumulative
-- for the session; where the harness reports only tokens, cost stays NULL —
-- the plane never invents cost numbers.
CREATE TABLE agent_task_usage (
  org text NOT NULL CHECK (length(org) > 0),
  task_id text NOT NULL REFERENCES agent_task(id),
  agent_id text NOT NULL REFERENCES agent(id),
  attempt integer NOT NULL CHECK (attempt > 0),
  tokens_total bigint CHECK (tokens_total IS NULL OR tokens_total >= 0),
  tokens_in bigint CHECK (tokens_in IS NULL OR tokens_in >= 0),
  tokens_out bigint CHECK (tokens_out IS NULL OR tokens_out >= 0),
  thought_tokens bigint CHECK (thought_tokens IS NULL OR thought_tokens >= 0),
  cached_read_tokens bigint CHECK (cached_read_tokens IS NULL OR cached_read_tokens >= 0),
  cached_write_tokens bigint CHECK (cached_write_tokens IS NULL OR cached_write_tokens >= 0),
  context_tokens bigint CHECK (context_tokens IS NULL OR context_tokens >= 0),
  context_window_size bigint CHECK (context_window_size IS NULL OR context_window_size >= 0),
  cost_amount numeric(14,4) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  cost_currency text CHECK (cost_currency IS NULL OR cost_currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, attempt)
);
CREATE INDEX agent_task_usage_window_idx ON agent_task_usage (org, occurred_at);

-- Operator budget entity (ordinary row, audited by the event log). Scope picks
-- the blast radius: whole org, one agent principal, or every agent bound to a
-- node. Enforcement consumes harness-reported usage inside the window.
CREATE TABLE agent_budget (
  id text PRIMARY KEY,
  org text NOT NULL CHECK (length(org) > 0),
  scope text NOT NULL CHECK (scope IN ('org', 'agent', 'node')),
  agent_id text REFERENCES agent(id),
  node_id text REFERENCES agent_node(id),
  "window" text NOT NULL CHECK ("window" IN ('daily', 'weekly', 'monthly')),
  ceiling_tokens bigint CHECK (ceiling_tokens IS NULL OR ceiling_tokens > 0),
  ceiling_cost_amount numeric(14,4) CHECK (ceiling_cost_amount IS NULL OR ceiling_cost_amount > 0),
  ceiling_cost_currency text CHECK (ceiling_cost_currency IS NULL OR ceiling_cost_currency ~ '^[A-Z]{3}$'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK ((scope = 'agent') = (agent_id IS NOT NULL)),
  CHECK ((scope = 'node') = (node_id IS NOT NULL)),
  CHECK (ceiling_tokens IS NOT NULL OR ceiling_cost_amount IS NOT NULL),
  CHECK ((ceiling_cost_amount IS NULL) = (ceiling_cost_currency IS NULL))
);
