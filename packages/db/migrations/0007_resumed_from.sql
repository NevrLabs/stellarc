-- Attempt continuity (NEVR-415): a lease-expiry retry used to cold-start from
-- the raw prompt — the dead attempt's transcript (already persisted, keyed
-- PRIMARY KEY (task_id, attempt, seq)) was thrown away, so every retry re-burned
-- tokens for work the dead attempt had already done and could re-run
-- side-effectful tool calls that had already landed.
--
-- Two facts make the fix cheap: the replay source is one ordered select, and
-- the retry's session is brand new (conn.newSession per attempt), so the seed
-- rides the claim descriptor and the node renders it into the prompt.

-- `resumed_from` is a first-class transcript kind (like `push`, 0005): the
-- node emits it as the FIRST item of a resumed attempt so operators see the
-- seam in the transcript itself, filterable by kind. Reusing `checkpoint`
-- was rejected — that kind belongs to harness checkpoints.
ALTER TABLE agent_task_item DROP CONSTRAINT IF EXISTS agent_task_item_kind_check;
ALTER TABLE agent_task_item ADD CONSTRAINT agent_task_item_kind_check
  CHECK (kind IN ('message', 'thinking', 'tool_call', 'tool_result', 'file_change', 'approval', 'checkpoint', 'config', 'harness_meta', 'usage', 'push', 'resumed_from'));

-- Which prior attempt the current attempt resumed (NULL = fresh start).
-- Written atomically with the claim; cleared back to NULL on any claim that
-- does not resume, so it never goes stale across mixed retry histories.
ALTER TABLE agent_task ADD COLUMN resumed_from_attempt integer
  CHECK (resumed_from_attempt IS NULL OR resumed_from_attempt >= 0);
