-- Canonical reconciliation #9 — asset rows <-> S3 objects bijection (SQL arm)
-- Owner: STL-20
-- Semantics source: STL-20 (asset rows <-> S3 objects bijection; HTTP arm resolves 200 via harness hook);
--   wave plan T6
-- Precondition tables: legacy.asset, public.asset
-- Blocked if: either is absent
-- Invariant: every legacy asset row maps to exactly one destination asset row with
--   identical columns (object_key bijection in particular). The HTTP arm (every asset
--   URL resolves 200) is exercised by the harness hook, not this SQL.
-- Violation-rows-returning: empty result set = green.

WITH checks AS (
  SELECT 'asset:missing-in-dest' AS violation, s.id, 'asset' AS tbl
    FROM legacy.asset s LEFT JOIN public.asset d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'asset:missing-in-src', d.id, 'asset'
    FROM public.asset d LEFT JOIN legacy.asset s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'asset:value-mismatch', s.id, 'asset'
    FROM legacy.asset s JOIN public.asset d ON d.id = s.id
   WHERE s.organization_id IS DISTINCT FROM d.organization_id
      OR s.board_id IS DISTINCT FROM d.board_id
      OR s.repo_id IS DISTINCT FROM d.repo_id
      OR s.task_id IS DISTINCT FROM d.task_id
      OR s.activity_id IS DISTINCT FROM d.activity_id
      OR s.object_key IS DISTINCT FROM d.object_key
      OR s.filename IS DISTINCT FROM d.filename
      OR s.mime_type IS DISTINCT FROM d.mime_type
      OR s.size IS DISTINCT FROM d.size
      OR s.kind IS DISTINCT FROM d.kind
      OR s.surface IS DISTINCT FROM d.surface
      OR s.created_by IS DISTINCT FROM d.created_by
  UNION ALL
  -- object_key uniqueness: any duplicated object_key across destination rows
  SELECT 'asset:object-key-collision', d.object_key, 'asset'
    FROM public.asset d
   WHERE d.object_key IS NOT NULL
   GROUP BY d.object_key
  HAVING count(*) > 1
)
SELECT * FROM checks;
