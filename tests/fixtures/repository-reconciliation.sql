-- STL-18 canonical reconciliation query #10 (orchestrator amendment A2).
-- Source: production dump restored as schema `kaneo_src`. Destination: the
-- imported Stellarc tables (public schema), joined by imported id.
-- Aggregates per org: count(repo), count(repo_issue), count(repo_pull_request),
-- count(github_installation), count(github_user_grant) and
-- sum(length(coalesce(body,''))) over issues+PRs. Column-exact: every row's
-- non-secret columns byte-equal via encode(digest(row_to_json(t)::text,
-- 'sha256'),'hex') with secret columns nulled on BOTH sides; secrets
-- (access_token, refresh_token) are compared only as is-null parity.
-- Result: one row per violation (organization_id, kind, src_n, dst_n);
-- empty result == reconciled. Requires pgcrypto. github_user_grant is
-- user-scoped (organization_id NULL). integration is board-owned (STL-16)
-- and excluded from #10 by A2.

WITH src AS (
  SELECT 'repo'::text AS kind, t.id, t.organization_id::text AS scope,
         encode(digest(row_to_json(t)::text, 'sha256'), 'hex') AS digest,
         NULL::text AS secret_is_null
  FROM kaneo_src.repo t
  UNION ALL
  SELECT 'repo_issue', t.id, r.organization_id::text,
         encode(digest(row_to_json(t)::text, 'sha256'), 'hex'), NULL::text
  FROM kaneo_src.repo_issue t
  JOIN kaneo_src.repo r ON r.id = t.repo_id
  UNION ALL
  SELECT 'repo_pull_request', t.id, r.organization_id::text,
         encode(digest(row_to_json(t)::text, 'sha256'), 'hex'), NULL::text
  FROM kaneo_src.repo_pull_request t
  JOIN kaneo_src.repo r ON r.id = t.repo_id
  UNION ALL
  SELECT 'github_installation', t.id, t.organization_id::text,
         encode(digest(row_to_json(t)::text, 'sha256'), 'hex'), NULL::text
  FROM kaneo_src.organization_github_installation t
  UNION ALL
  SELECT 'github_user_grant', t.id, NULL::text,
         encode(digest(row_to_json(x)::text, 'sha256'), 'hex'),
         (t.access_token IS NULL)::text
  FROM kaneo_src.github_user_grant t
  CROSS JOIN LATERAL (SELECT
    t.id, t.user_id, t.provider_id, t.github_user_id, t.github_login,
    NULL::text AS access_token, NULL::text AS refresh_token,
    t.access_token_expires_at, t.refresh_token_expires_at, t.scope,
    t.created_at, t.updated_at) x
),
dst AS (
  SELECT 'repo'::text AS kind, t.id, t.organization_id::text AS scope,
         encode(digest(row_to_json(t)::text, 'sha256'), 'hex') AS digest,
         NULL::text AS secret_is_null
  FROM repo t
  UNION ALL
  SELECT 'repo_issue', t.id, r.organization_id::text,
         encode(digest(row_to_json(t)::text, 'sha256'), 'hex'), NULL::text
  FROM repo_issue t
  JOIN repo r ON r.id = t.repo_id
  UNION ALL
  SELECT 'repo_pull_request', t.id, r.organization_id::text,
         encode(digest(row_to_json(t)::text, 'sha256'), 'hex'), NULL::text
  FROM repo_pull_request t
  JOIN repo r ON r.id = t.repo_id
  UNION ALL
  SELECT 'github_installation', t.id, t.organization_id::text,
         encode(digest(row_to_json(t)::text, 'sha256'), 'hex'), NULL::text
  FROM organization_github_installation t
  UNION ALL
  SELECT 'github_user_grant', t.id, NULL::text,
         encode(digest(row_to_json(x)::text, 'sha256'), 'hex'),
         (t.access_token IS NULL)::text
  FROM github_user_grant t
  CROSS JOIN LATERAL (SELECT
    t.id, t.user_id, t.provider_id, t.github_user_id, t.github_login,
    NULL::text AS access_token, NULL::text AS refresh_token,
    t.access_token_expires_at, t.refresh_token_expires_at, t.scope,
    t.created_at, t.updated_at) x
),
row_mismatch AS (
  SELECT coalesce(s.kind, d.kind) AS kind
  FROM src s
  FULL JOIN dst d ON s.kind = d.kind AND s.id = d.id
  WHERE s.id IS NULL OR d.id IS NULL
     OR s.digest <> d.digest
     OR coalesce(s.secret_is_null, '') <> coalesce(d.secret_is_null, '')
),
scope_all AS (
  SELECT kind, scope, true AS is_src FROM src
  UNION ALL
  SELECT kind, scope, false FROM dst
),
count_diffs AS (
  SELECT c.scope AS organization_id, c.kind,
         (SELECT count(*) FROM scope_all s WHERE s.kind = c.kind AND s.scope IS NOT DISTINCT FROM c.scope AND s.is_src) AS src_n,
         (SELECT count(*) FROM scope_all d WHERE d.kind = c.kind AND d.scope IS NOT DISTINCT FROM c.scope AND NOT d.is_src) AS dst_n
  FROM (SELECT DISTINCT kind, scope FROM scope_all) c
),
body_src AS (
  SELECT r.organization_id,
         sum(length(coalesce(ri.body, '')) + length(coalesce(rp.body, ''))) AS total
  FROM kaneo_src.repo r
  LEFT JOIN kaneo_src.repo_issue ri ON ri.repo_id = r.id
  LEFT JOIN kaneo_src.repo_pull_request rp ON rp.repo_id = r.id
  GROUP BY r.organization_id
),
body_dst AS (
  SELECT r.organization_id,
         sum(length(coalesce(ri.body, '')) + length(coalesce(rp.body, ''))) AS total
  FROM repo r
  LEFT JOIN repo_issue ri ON ri.repo_id = r.id
  LEFT JOIN repo_pull_request rp ON rp.repo_id = r.id
  GROUP BY r.organization_id
),
body_orgs AS (
  SELECT organization_id FROM body_src
  UNION
  SELECT organization_id FROM body_dst
)
SELECT organization_id, kind, src_n::bigint, dst_n::bigint FROM count_diffs
WHERE src_n <> dst_n
UNION ALL
SELECT b.organization_id, 'body_length',
       coalesce(s.total, 0)::bigint, coalesce(d.total, 0)::bigint
FROM body_orgs b
LEFT JOIN body_src s ON s.organization_id = b.organization_id
LEFT JOIN body_dst d ON d.organization_id = b.organization_id
WHERE coalesce(s.total, 0) <> coalesce(d.total, 0)
UNION ALL
SELECT NULL::text, 'row_digest', count(*)::bigint, count(*)::bigint FROM row_mismatch
HAVING count(*) > 0
ORDER BY 1 NULLS LAST, 2;
