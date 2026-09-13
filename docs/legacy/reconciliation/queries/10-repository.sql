-- Canonical reconciliation #10 — repository fidelity
-- Owner: STL-18
-- Semantics source: STL-18 (all-column fidelity); wave plan T4
-- Precondition tables: legacy.repo, legacy.repo_issue, legacy.repo_pull_request,
--   legacy.organization_github_installation, legacy.github_user_grant, legacy.integration
--   and their public.* mirrors
-- Blocked if: any is absent
-- Violation-rows-returning: empty result set = green.

WITH checks AS (
  -- repo
  SELECT 'repo:missing-in-dest' AS violation, s.id, 'repo' AS tbl
    FROM legacy.repo s LEFT JOIN public.repo d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'repo:missing-in-src', d.id, 'repo'
    FROM public.repo d LEFT JOIN legacy.repo s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'repo:value-mismatch', s.id, 'repo'
    FROM legacy.repo s JOIN public.repo d ON d.id = s.id
   WHERE s.organization_id IS DISTINCT FROM d.organization_id
      OR s.provider IS DISTINCT FROM d.provider
      OR s.owner IS DISTINCT FROM d.owner
      OR s.name IS DISTINCT FROM d.name
      OR s.external_id IS DISTINCT FROM d.external_id
      OR s.url IS DISTINCT FROM d.url
      OR s.description IS DISTINCT FROM d.description
      OR s.default_branch IS DISTINCT FROM d.default_branch
      OR s.is_private IS DISTINCT FROM d.is_private
      OR s.is_active IS DISTINCT FROM d.is_active
      OR s.org_privilege IS DISTINCT FROM d.org_privilege
  -- repo_issue
  UNION ALL
  SELECT 'repo_issue:missing-in-dest', s.id, 'repo_issue'
    FROM legacy.repo_issue s LEFT JOIN public.repo_issue d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'repo_issue:missing-in-src', d.id, 'repo_issue'
    FROM public.repo_issue d LEFT JOIN legacy.repo_issue s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'repo_issue:value-mismatch', s.id, 'repo_issue'
    FROM legacy.repo_issue s JOIN public.repo_issue d ON d.id = s.id
   WHERE s.repo_id IS DISTINCT FROM d.repo_id
      OR s.number IS DISTINCT FROM d.number
      OR s.external_id IS DISTINCT FROM d.external_id
      OR s.title IS DISTINCT FROM d.title
      OR s.body IS DISTINCT FROM d.body
      OR s.state IS DISTINCT FROM d.state
      OR s.author_login IS DISTINCT FROM d.author_login
      OR s.comment_count IS DISTINCT FROM d.comment_count
      OR s.url IS DISTINCT FROM d.url
  -- repo_pull_request
  UNION ALL
  SELECT 'repo_pull_request:missing-in-dest', s.id, 'repo_pull_request'
    FROM legacy.repo_pull_request s LEFT JOIN public.repo_pull_request d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'repo_pull_request:missing-in-src', d.id, 'repo_pull_request'
    FROM public.repo_pull_request d LEFT JOIN legacy.repo_pull_request s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'repo_pull_request:value-mismatch', s.id, 'repo_pull_request'
    FROM legacy.repo_pull_request s JOIN public.repo_pull_request d ON d.id = s.id
   WHERE s.repo_id IS DISTINCT FROM d.repo_id
      OR s.number IS DISTINCT FROM d.number
      OR s.external_id IS DISTINCT FROM d.external_id
      OR s.title IS DISTINCT FROM d.title
      OR s.body IS DISTINCT FROM d.body
      OR s.state IS DISTINCT FROM d.state
      OR s.is_draft IS DISTINCT FROM d.is_draft
      OR s.author_login IS DISTINCT FROM d.author_login
      OR s.head_branch IS DISTINCT FROM d.head_branch
      OR s.base_branch IS DISTINCT FROM d.base_branch
      OR s.comment_count IS DISTINCT FROM d.comment_count
      OR s.url IS DISTINCT FROM d.url
  -- organization_github_installation
  UNION ALL
  SELECT 'installation:missing-in-dest', s.id, 'organization_github_installation'
    FROM legacy.organization_github_installation s
    LEFT JOIN public.organization_github_installation d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'installation:missing-in-src', d.id, 'organization_github_installation'
    FROM public.organization_github_installation d
    LEFT JOIN legacy.organization_github_installation s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'installation:value-mismatch', s.id, 'organization_github_installation'
    FROM legacy.organization_github_installation s
    JOIN public.organization_github_installation d ON d.id = s.id
   WHERE s.organization_id IS DISTINCT FROM d.organization_id
      OR s.installation_id IS DISTINCT FROM d.installation_id
      OR s.account_id IS DISTINCT FROM d.account_id
      OR s.account_login IS DISTINCT FROM d.account_login
      OR s.account_type IS DISTINCT FROM d.account_type
  -- github_user_grant
  UNION ALL
  SELECT 'github_user_grant:missing-in-dest', s.id, 'github_user_grant'
    FROM legacy.github_user_grant s LEFT JOIN public.github_user_grant d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'github_user_grant:missing-in-src', d.id, 'github_user_grant'
    FROM public.github_user_grant d LEFT JOIN legacy.github_user_grant s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'github_user_grant:value-mismatch', s.id, 'github_user_grant'
    FROM legacy.github_user_grant s JOIN public.github_user_grant d ON d.id = s.id
   WHERE s.user_id IS DISTINCT FROM d.user_id
      OR s.provider_id IS DISTINCT FROM d.provider_id
      OR s.github_user_id IS DISTINCT FROM d.github_user_id
      OR s.github_login IS DISTINCT FROM d.github_login
      OR s.access_token IS DISTINCT FROM d.access_token
  -- integration
  UNION ALL
  SELECT 'integration:missing-in-dest', s.id, 'integration'
    FROM legacy.integration s LEFT JOIN public.integration d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'integration:missing-in-src', d.id, 'integration'
    FROM public.integration d LEFT JOIN legacy.integration s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'integration:value-mismatch', s.id, 'integration'
    FROM legacy.integration s JOIN public.integration d ON d.id = s.id
   WHERE s.board_id IS DISTINCT FROM d.board_id
      OR s.type IS DISTINCT FROM d.type
      OR s.config IS DISTINCT FROM d.config
      OR s.is_active IS DISTINCT FROM d.is_active
)
SELECT * FROM checks;
