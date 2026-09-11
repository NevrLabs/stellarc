-- Canonical reconciliation #6 — zero orphan statuses
-- Owner: STL-16
-- Semantics source: STL-16 §1 (fork SET-NULL orphan pattern); wave plan T2
-- Precondition tables: legacy.task, legacy.column, public.ticket, public.status
-- Blocked if: any is absent
-- Invariant: every ticket's effective status resolves to a status row (column slug)
--   or a virtual taxonomy value. A status slug that is neither is an orphan.
-- Violation-rows-returning: empty result set = green.

WITH virtual_taxonomy(slug) AS (
  VALUES ('to-do'), ('in-progress'), ('in-review'), ('done'),
         ('canceled'), ('duplicate'), ('triage'), ('planned')
)
SELECT 'status:orphan' AS violation, t.id, 'ticket' AS tbl
  FROM public.ticket t
 WHERE t.status IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.status c
      WHERE c.board_id = t.board_id AND c.slug = t.status
   )
   AND NOT EXISTS (
     SELECT 1 FROM virtual_taxonomy v WHERE v.slug = t.status
   );
