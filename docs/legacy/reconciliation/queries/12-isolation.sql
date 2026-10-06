-- Canonical reconciliation #12 — cross-org isolation
-- Owner: STL-20
-- Semantics source: STL-20 (no principal-readable row, grant, or shape leaks across orgs); wave plan T6
-- Precondition tables: legacy.organization, legacy.board, legacy.task, legacy.resource_grant
--   and public.organization, public.board, public.ticket, public.resource_grant
-- Blocked if: any is absent
-- Invariant: no resource, grant, or shape row references an entity from a different
--   organization. A grant whose organization_id differs from the resource's owning org,
--   or an asset whose organization_id differs from its context's org, is a leak.
-- Violation-rows-returning: empty result set = green.

WITH checks AS (
  -- grant -> board org leak
  SELECT 'isolation:grant-board-org-leak' AS violation, g.id, 'resource_grant' AS tbl
    FROM public.resource_grant g
    JOIN public.board b ON b.id = g.resource_id
   WHERE g.resource_type = 'board'
     AND g.organization_id <> b.organization_id
  UNION ALL
  -- grant -> repo org leak
  SELECT 'isolation:grant-repo-org-leak', g.id, 'resource_grant'
    FROM public.resource_grant g
    JOIN public.repo r ON r.id = g.resource_id
   WHERE g.resource_type = 'repo'
     AND g.organization_id <> r.organization_id
  UNION ALL
  -- asset -> board org leak
  SELECT 'isolation:asset-board-org-leak', a.id, 'asset'
    FROM public.asset a
    JOIN public.board b ON b.id = a.board_id
   WHERE a.organization_id <> b.organization_id
  UNION ALL
  -- asset -> repo org leak
  SELECT 'isolation:asset-repo-org-leak', a.id, 'asset'
    FROM public.asset a
    JOIN public.repo r ON r.id = a.repo_id
   WHERE a.organization_id <> r.organization_id
  UNION ALL
  -- ticket via board must share the board's org (ticket has no org column; board is the owner)
  SELECT 'isolation:ticket-board-missing-owner', t.id, 'ticket'
    FROM public.ticket t
    LEFT JOIN public.board b ON b.id = t.board_id
   WHERE b.id IS NULL
)
SELECT * FROM checks;
