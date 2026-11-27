-- Usage-scope honesty on resume (NEVR-686; the Multica #10703 / MUL-9312 law):
-- a resumed attempt runs in a NEW harness session whose cumulative counter may
-- carry over from the prior session or restart at zero — the usage row could
-- not tell the two apart. Two consequences, both fixed here at the data layer:
-- a carried-over counter made the budget's flat SUM over attempt rows
-- double-count every resumed task, and a differently-scoped terminal report
-- silently overwrote consistent numbers the attempt had already recorded.
--
-- scope: what the adapter contract VERIFIABLY says about the counters a
-- report carries. NULL = `session` (cumulative for the harness session —
-- today's documented semantics, so pre-migration rows and every report the
-- adapter cannot verify keep today's meaning byte-for-byte); 'execution' is
-- claimed only where the adapter verifiably reports per-execution totals
-- (the CodeBuddy dual record's modelUsage half). Scope is claimed, never
-- inferred — a shrinking counter is a regression event, not a scope discovery.
ALTER TABLE agent_task_usage ADD COLUMN scope text
  CHECK (scope IS NULL OR scope IN ('execution', 'session'));

-- Raw first/last counter watermarks per attempt, maintained from
-- session-scoped reports only (execution totals are per-execution numbers;
-- they never feed a cumulative-counter comparison). The budget's chain rule
-- is derived from these — our own observations, never harness cooperation:
-- a resumed attempt whose FIRST raw counter is >= its predecessor's LAST
-- continued the session counter (the chain's usage is the final raw counter,
-- not the row sum); lower means the counter restarted (sum the rows).
-- Pre-migration rows have NULL watermarks and fall back to the row sum —
-- today's behavior.
ALTER TABLE agent_task_usage ADD COLUMN raw_first_tokens_total bigint
  CHECK (raw_first_tokens_total IS NULL OR raw_first_tokens_total >= 0);
ALTER TABLE agent_task_usage ADD COLUMN raw_last_tokens_total bigint
  CHECK (raw_last_tokens_total IS NULL OR raw_last_tokens_total >= 0);
ALTER TABLE agent_task_usage ADD COLUMN raw_first_cost_amount numeric(14,4)
  CHECK (raw_first_cost_amount IS NULL OR raw_first_cost_amount >= 0);
ALTER TABLE agent_task_usage ADD COLUMN raw_last_cost_amount numeric(14,4)
  CHECK (raw_last_cost_amount IS NULL OR raw_last_cost_amount >= 0);

-- Session-cumulative baseline captured at attempt start when the harness
-- offers a pre-prompt usage signal: session-scoped reports on the attempt
-- normalize to the attempt's own usage by baseline subtraction. No signal →
-- NULL → raw values stand (never negative, never guessed) and a RESUMED
-- attempt emits exactly one usage_scope_ambiguous event;
-- scope_ambiguous_at is that exactly-once guard.
ALTER TABLE agent_task_usage ADD COLUMN baseline jsonb
  CHECK (baseline IS NULL OR jsonb_typeof(baseline) = 'object');
ALTER TABLE agent_task_usage ADD COLUMN scope_ambiguous_at timestamptz;
