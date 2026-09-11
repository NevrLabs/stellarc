-- Canonical reconciliation #11 — grants apply to the same (principal, resource)
-- Owner: STL-20
-- Semantics source: STL-20 (grants apply to the same (principal, resource) both sides); wave plan T6
-- Precondition tables: legacy.resource_grant, public.resource_grant
-- Blocked if: either is absent
-- Invariant: every legacy grant maps to exactly one destination grant on the same
--   (organization, resource_type, resource_id, principal) with equal privilege.
-- Violation-rows-returning: empty result set = green.

WITH checks AS (
  SELECT 'resource_grant:missing-in-dest' AS violation, s.id, 'resource_grant' AS tbl
    FROM legacy.resource_grant s
    LEFT JOIN public.resource_grant d
      ON d.organization_id = s.organization_id
     AND d.resource_type = s.resource_type
     AND d.resource_id = s.resource_id
     AND d.user_id IS NOT DISTINCT FROM s.user_id
     AND d.team_id IS NOT DISTINCT FROM s.team_id
   WHERE d.id IS NULL
  UNION ALL
  SELECT 'resource_grant:missing-in-src', d.id, 'resource_grant'
    FROM public.resource_grant d
    LEFT JOIN legacy.resource_grant s
      ON s.organization_id = d.organization_id
     AND s.resource_type = d.resource_type
     AND s.resource_id = d.resource_id
     AND s.user_id IS NOT DISTINCT FROM d.user_id
     AND s.team_id IS NOT DISTINCT FROM d.team_id
   WHERE s.id IS NULL
  UNION ALL
  SELECT 'resource_grant:privilege-mismatch', s.id, 'resource_grant'
    FROM legacy.resource_grant s
    JOIN public.resource_grant d
      ON d.organization_id = s.organization_id
     AND d.resource_type = s.resource_type
     AND d.resource_id = s.resource_id
     AND d.user_id IS NOT DISTINCT FROM s.user_id
     AND d.team_id IS NOT DISTINCT FROM s.team_id
   WHERE s.privilege IS DISTINCT FROM d.privilege
)
SELECT * FROM checks;
