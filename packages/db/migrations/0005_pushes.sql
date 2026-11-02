-- Push attribution (NEVR-199): the durable local fact "this run pushed these
-- commits" exists before the Kaneo-parity GitHub linkage lands. Commit
-- authorship is spoofable free text; the push event is the authenticated
-- attribution (GitHub push attribution, Oct 2026, same gap closed locally).
--
-- `push` is a first-class transcript kind (never harness_meta): typed at the
-- node seam, one item + one row + one agents:task_pushed event per push.

ALTER TABLE agent_task_item DROP CONSTRAINT IF EXISTS agent_task_item_kind_check;
ALTER TABLE agent_task_item ADD CONSTRAINT agent_task_item_kind_check
  CHECK (kind IN ('message', 'thinking', 'tool_call', 'tool_result', 'file_change', 'approval', 'checkpoint', 'config', 'harness_meta', 'usage', 'push'));

-- Typed push tuples per task attempt, deduped on (task, attempt, commit, ref):
-- the future GitHub linkage joins on commit_sha instead of inventing
-- attribution later. Remote-tracking reflog provenance is recorded verbatim.
CREATE TABLE agent_task_push (
  org text NOT NULL CHECK (length(org) > 0),
  task_id text NOT NULL REFERENCES agent_task(id),
  attempt integer NOT NULL CHECK (attempt > 0),
  commit_sha text NOT NULL CHECK (commit_sha ~ '^[0-9a-f]{40}$'),
  ref text NOT NULL CHECK (length(ref) > 0),
  remote text NOT NULL CHECK (length(remote) > 0),
  pushed_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, attempt, commit_sha, ref)
);
CREATE INDEX agent_task_push_commit_idx ON agent_task_push (org, commit_sha);
