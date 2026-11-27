-- Provider rate/capacity throttling (NEVR-670; law Multica #10677 / MUL-9320):
-- a throttled provider reported through a generic wrapped error (Kiro:
-- session/prompt -32603 "Internal error", real cause in data) was either a
-- never-retried "agent" fault (prompt_failed) or an unpaced attempt-burning
-- requeue loop (protocol_error). Throttling is transient provider capacity:
-- not agent failure, not permanent.
--
-- provider_rate_limited is a parked state like budget_exhausted, with two
-- deliberate differences: failure_code IS set ('platform.provider_rate_limited',
-- carried through unpark so the resume gate at claim can read it) and the
-- unpark is TIME-based — parked_until holds the earliest requeue time
-- (30s doubling to a 10-minute cap per park, honoring a parseable
-- Retry-After, capped the same). The attempt cap stays the terminal bound:
-- at attempt >= max_attempts the throttle finishes the task failed instead
-- of parking, so no task parks forever.
ALTER TABLE agent_task DROP CONSTRAINT IF EXISTS agent_task_status_check;
ALTER TABLE agent_task ADD CONSTRAINT agent_task_status_check
  CHECK (status IN ('queued', 'claimed', 'running', 'completed', 'failed', 'cancelled', 'budget_exhausted', 'needs_permission', 'provider_rate_limited'));

-- Earliest requeue time while parked in provider_rate_limited; NULL in
-- every other state. The partial index mirrors agent_task_lease_idx: the
-- unpark scan (reapExpired) reads exactly these rows.
ALTER TABLE agent_task ADD COLUMN parked_until timestamptz;
CREATE INDEX agent_task_parked_until_idx ON agent_task (parked_until) WHERE status = 'provider_rate_limited';
