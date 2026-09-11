-- Canonical reconciliation #1 — identity core fidelity
-- Owner: STL-15
-- Semantics source: STL-15 §2/§7 T23 (all-column fidelity, PK-set equality); wave plan T1
-- Precondition tables: legacy.user, legacy.account, legacy.organization,
--   legacy.organization_member, legacy.organization_role and their public.* mirrors
-- Blocked if: any of the above is absent
-- Violation-rows-returning: empty result set = green.

WITH checks AS (
  -- user
  SELECT 'user:missing-in-dest' AS violation, s.id, 'user' AS tbl
    FROM legacy."user" s LEFT JOIN public."user" d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'user:missing-in-src', d.id, 'user'
    FROM public."user" d LEFT JOIN legacy."user" s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'user:value-mismatch', s.id, 'user'
    FROM legacy."user" s JOIN public."user" d ON d.id = s.id
   WHERE s.name IS DISTINCT FROM d.name
      OR s.email IS DISTINCT FROM d.email
      OR s.email_verified IS DISTINCT FROM d.email_verified
      OR s.image IS DISTINCT FROM d.image
      OR s.locale IS DISTINCT FROM d.locale
      OR s.is_anonymous IS DISTINCT FROM d.is_anonymous
      OR s.role IS DISTINCT FROM d.role
      OR s.banned IS DISTINCT FROM d.banned
      OR s.ban_reason IS DISTINCT FROM d.ban_reason
  -- account
  UNION ALL
  SELECT 'account:missing-in-dest', s.id, 'account'
    FROM legacy.account s LEFT JOIN public.account d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'account:missing-in-src', d.id, 'account'
    FROM public.account d LEFT JOIN legacy.account s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'account:value-mismatch', s.id, 'account'
    FROM legacy.account s JOIN public.account d ON d.id = s.id
   WHERE s.account_id IS DISTINCT FROM d.account_id
      OR s.provider_id IS DISTINCT FROM d.provider_id
      OR s.user_id IS DISTINCT FROM d.user_id
      OR s.access_token IS DISTINCT FROM d.access_token
      OR s.refresh_token IS DISTINCT FROM d.refresh_token
      OR s.id_token IS DISTINCT FROM d.id_token
      OR s.scope IS DISTINCT FROM d.scope
      OR s.password IS DISTINCT FROM d.password
  -- organization
  UNION ALL
  SELECT 'organization:missing-in-dest', s.id, 'organization'
    FROM legacy.organization s LEFT JOIN public.organization d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'organization:missing-in-src', d.id, 'organization'
    FROM public.organization d LEFT JOIN legacy.organization s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'organization:value-mismatch', s.id, 'organization'
    FROM legacy.organization s JOIN public.organization d ON d.id = s.id
   WHERE s.name IS DISTINCT FROM d.name
      OR s.slug IS DISTINCT FROM d.slug
      OR s.logo IS DISTINCT FROM d.logo
      OR s.metadata IS DISTINCT FROM d.metadata
      OR s.description IS DISTINCT FROM d.description
      OR s.repos_enabled IS DISTINCT FROM d.repos_enabled
      OR s.tables_enabled IS DISTINCT FROM d.tables_enabled
      OR s.default_resource_privilege IS DISTINCT FROM d.default_resource_privilege
      OR s.ai_enabled IS DISTINCT FROM d.ai_enabled
      OR s.ai_default_token_limit IS DISTINCT FROM d.ai_default_token_limit
      OR s.ai_default_character_limit IS DISTINCT FROM d.ai_default_character_limit
      OR s.ai_provider_base_url IS DISTINCT FROM d.ai_provider_base_url
      OR s.ai_provider_model IS DISTINCT FROM d.ai_provider_model
      OR s.ai_provider_api_key IS DISTINCT FROM d.ai_provider_api_key
  -- organization_member
  UNION ALL
  SELECT 'organization_member:missing-in-dest', s.id, 'organization_member'
    FROM legacy.organization_member s LEFT JOIN public.organization_member d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'organization_member:missing-in-src', d.id, 'organization_member'
    FROM public.organization_member d LEFT JOIN legacy.organization_member s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'organization_member:value-mismatch', s.id, 'organization_member'
    FROM legacy.organization_member s JOIN public.organization_member d ON d.id = s.id
   WHERE s.organization_id IS DISTINCT FROM d.organization_id
      OR s.user_id IS DISTINCT FROM d.user_id
      OR s.role IS DISTINCT FROM d.role
      OR s.ai_token_limit IS DISTINCT FROM d.ai_token_limit
      OR s.ai_character_limit IS DISTINCT FROM d.ai_character_limit
  -- organization_role
  UNION ALL
  SELECT 'organization_role:missing-in-dest', s.id, 'organization_role'
    FROM legacy.organization_role s LEFT JOIN public.organization_role d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'organization_role:missing-in-src', d.id, 'organization_role'
    FROM public.organization_role d LEFT JOIN legacy.organization_role s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'organization_role:value-mismatch', s.id, 'organization_role'
    FROM legacy.organization_role s JOIN public.organization_role d ON d.id = s.id
   WHERE s.organization_id IS DISTINCT FROM d.organization_id
      OR s.role IS DISTINCT FROM d.role
      OR s.permission IS DISTINCT FROM d.permission
)
SELECT * FROM checks;
