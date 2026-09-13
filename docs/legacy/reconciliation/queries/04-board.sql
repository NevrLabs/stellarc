-- Canonical reconciliation #4 — board + board_key_alias fidelity
-- Owner: STL-16
-- Semantics source: STL-16 §1 (all-column fidelity); wave plan T2
-- Precondition tables: legacy.board, legacy.board_key_alias, public.board, public.board_key_alias
-- Blocked if: any is absent
-- Violation-rows-returning: empty result set = green.

WITH checks AS (
  SELECT 'board:missing-in-dest' AS violation, s.id, 'board' AS tbl
    FROM legacy.board s LEFT JOIN public.board d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'board:missing-in-src', d.id, 'board'
    FROM public.board d LEFT JOIN legacy.board s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'board:value-mismatch', s.id, 'board'
    FROM legacy.board s JOIN public.board d ON d.id = s.id
   WHERE s.organization_id IS DISTINCT FROM d.organization_id
      OR s.slug IS DISTINCT FROM d.slug
      OR s.icon IS DISTINCT FROM d.icon
      OR s.name IS DISTINCT FROM d.name
      OR s.description IS DISTINCT FROM d.description
      OR s.is_public IS DISTINCT FROM d.is_public
      OR s.archived_at IS DISTINCT FROM d.archived_at
      OR s.last_task_number IS DISTINCT FROM d.last_task_number
      OR s.org_privilege IS DISTINCT FROM d.org_privilege
      OR s.task_status_order IS DISTINCT FROM d.task_status_order
      OR s.backlog_status_order IS DISTINCT FROM d.backlog_status_order
      OR s.subtask_depth_limit IS DISTINCT FROM d.subtask_depth_limit
      OR s.default_assignee_id IS DISTINCT FROM d.default_assignee_id
      OR s.default_assignee_team_id IS DISTINCT FROM d.default_assignee_team_id
  -- board_key_alias
  UNION ALL
  SELECT 'board_key_alias:missing-in-dest', s.id, 'board_key_alias'
    FROM legacy.board_key_alias s LEFT JOIN public.board_key_alias d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'board_key_alias:missing-in-src', d.id, 'board_key_alias'
    FROM public.board_key_alias d LEFT JOIN legacy.board_key_alias s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'board_key_alias:value-mismatch', s.id, 'board_key_alias'
    FROM legacy.board_key_alias s JOIN public.board_key_alias d ON d.id = s.id
   WHERE s.organization_id IS DISTINCT FROM d.organization_id
      OR s.board_id IS DISTINCT FROM d.board_id
      OR s.key IS DISTINCT FROM d.key
)
SELECT * FROM checks;
