-- Canonical reconciliation #2 — team/invitation/avatar fidelity
-- Owner: STL-15
-- Semantics source: STL-15 §2; wave plan T1
-- Precondition tables: legacy.team, legacy.team_member, legacy.invitation,
--   legacy.user_avatar and their public.* mirrors
-- Blocked if: any of the above is absent
-- Violation-rows-returning: empty result set = green.

WITH checks AS (
  -- team
  SELECT 'team:missing-in-dest' AS violation, s.id, 'team' AS tbl
    FROM legacy.team s LEFT JOIN public.team d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'team:missing-in-src', d.id, 'team'
    FROM public.team d LEFT JOIN legacy.team s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'team:value-mismatch', s.id, 'team'
    FROM legacy.team s JOIN public.team d ON d.id = s.id
   WHERE s.name IS DISTINCT FROM d.name
      OR s.organization_id IS DISTINCT FROM d.organization_id
      OR s.source IS DISTINCT FROM d.source
      OR s.icon IS DISTINCT FROM d.icon
      OR s.parent_team_id IS DISTINCT FROM d.parent_team_id
  -- team_member
  UNION ALL
  SELECT 'team_member:missing-in-dest', s.id, 'team_member'
    FROM legacy.team_member s LEFT JOIN public.team_member d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'team_member:missing-in-src', d.id, 'team_member'
    FROM public.team_member d LEFT JOIN legacy.team_member s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'team_member:value-mismatch', s.id, 'team_member'
    FROM legacy.team_member s JOIN public.team_member d ON d.id = s.id
   WHERE s.team_id IS DISTINCT FROM d.team_id
      OR s.user_id IS DISTINCT FROM d.user_id
  -- invitation
  UNION ALL
  SELECT 'invitation:missing-in-dest', s.id, 'invitation'
    FROM legacy.invitation s LEFT JOIN public.invitation d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'invitation:missing-in-src', d.id, 'invitation'
    FROM public.invitation d LEFT JOIN legacy.invitation s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'invitation:value-mismatch', s.id, 'invitation'
    FROM legacy.invitation s JOIN public.invitation d ON d.id = s.id
   WHERE s.organization_id IS DISTINCT FROM d.organization_id
      OR s.email IS DISTINCT FROM d.email
      OR s.role IS DISTINCT FROM d.role
      OR s.team_id IS DISTINCT FROM d.team_id
      OR s.status IS DISTINCT FROM d.status
      OR s.inviter_id IS DISTINCT FROM d.inviter_id
  -- user_avatar (bytea compared via octet-length + bytea equality)
  UNION ALL
  SELECT 'user_avatar:missing-in-dest', s.id, 'user_avatar'
    FROM legacy.user_avatar s LEFT JOIN public.user_avatar d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'user_avatar:missing-in-src', d.id, 'user_avatar'
    FROM public.user_avatar d LEFT JOIN legacy.user_avatar s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'user_avatar:value-mismatch', s.id, 'user_avatar'
    FROM legacy.user_avatar s JOIN public.user_avatar d ON d.id = s.id
   WHERE s.user_id IS DISTINCT FROM d.user_id
      OR s.mime_type IS DISTINCT FROM d.mime_type
      OR s.size IS DISTINCT FROM d.size
      OR s.data IS DISTINCT FROM d.data
)
SELECT * FROM checks;
