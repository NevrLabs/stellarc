-- Canonical reconciliation #5 — task→ticket fidelity (PREFIX-seq key, description_history byte-exact)
-- Owner: STL-16
-- Semantics source: STL-16 (task→ticket, PREFIX-seq preserved, description_history jsonb byte-exact); wave plan T2
-- Precondition tables: legacy.task, legacy.board_key_alias, public.ticket, public.board_key_alias
-- Blocked if: any is absent
-- Violation-rows-returning: empty result set = green.

WITH keyed AS (
  SELECT t.*, COALESCE(a.key, b.slug) || '-' || t.number::text AS expected_key
    FROM legacy.task t
    JOIN legacy.board b ON b.id = t.board_id
    LEFT JOIN legacy.board_key_alias a ON a.board_id = t.board_id
),
checks AS (
  SELECT 'ticket:missing-in-dest' AS violation, s.id, 'ticket' AS tbl
    FROM keyed s LEFT JOIN public.ticket d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'ticket:missing-in-src', d.id, 'ticket'
    FROM public.ticket d LEFT JOIN legacy.task s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'ticket:value-mismatch', s.id, 'ticket'
    FROM keyed s JOIN public.ticket d ON d.id = s.id
   WHERE s.board_id IS DISTINCT FROM d.board_id
      OR s.position IS DISTINCT FROM d.position
      OR s.number IS DISTINCT FROM d.number
      OR s.assignee_id IS DISTINCT FROM d.assignee_id
      OR s.team_assignee_id IS DISTINCT FROM d.team_assignee_id
      OR s.title IS DISTINCT FROM d.title
      OR s.description IS DISTINCT FROM d.description
      OR s.description_history IS DISTINCT FROM d.description_history
      OR s.status IS DISTINCT FROM d.status
      OR s.column_id IS DISTINCT FROM d.column_id
      OR s.priority IS DISTINCT FROM d.priority
      OR s.milestone_id IS DISTINCT FROM d.milestone_id
      OR s.archived_at IS DISTINCT FROM d.archived_at
      OR s.archived_by IS DISTINCT FROM d.archived_by
      OR s.deleted_at IS DISTINCT FROM d.deleted_at
      OR s.deleted_by IS DISTINCT FROM d.deleted_by
      OR s.start_date IS DISTINCT FROM d.start_date
      OR s.due_date IS DISTINCT FROM d.due_date
      OR s.expected_key IS DISTINCT FROM d.key
)
SELECT * FROM checks;
