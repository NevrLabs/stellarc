-- Canonical reconciliation #13 — id bijection via ledger source_pk
-- Owner: STL-27
-- Semantics source: STL-27 §2 (this ticket); STL-15 §2 identity_import ledger contract
--   identity_import(source_id, table_name, source_pk, digest). Identity importers preserve
--   source PKs verbatim (STL-15 §2 "preserve source identifiers"), so destination PK = source_pk.
-- Precondition tables: legacy identity tables; public.identity_import; public.user, public.account,
--   public.organization, public.organization_member, public.organization_role
-- Blocked if: identity_import absent, destination identity tables absent, or the merged ledger
--   neither preserves PKs nor records destination_id.
-- Invariant: every ledger (table_name, source_pk) maps to exactly one destination row, and every
--   destination identity row has exactly one ledger entry. destination_id is required where PKs
--   are not preserved (not the case for identity).
-- Violation-rows-returning: empty result set = green.

WITH dest AS (
  SELECT 'user' AS table_name, id AS pk FROM public."user"
  UNION ALL SELECT 'account', id FROM public.account
  UNION ALL SELECT 'organization', id FROM public.organization
  UNION ALL SELECT 'organization_member', id FROM public.organization_member
  UNION ALL SELECT 'organization_role', id FROM public.organization_role
),
checks AS (
  -- ledger entry with no matching destination row
  SELECT 'id-bijection:ledger-no-dest' AS violation, i.source_pk, i.table_name AS tbl
    FROM public.identity_import i
    LEFT JOIN dest d ON d.table_name = i.table_name AND d.pk = i.source_pk
   WHERE d.pk IS NULL
  UNION ALL
  -- destination row with no ledger entry
  SELECT 'id-bijection:dest-no-ledger', d.pk, d.table_name
    FROM dest d
    LEFT JOIN public.identity_import i ON i.table_name = d.table_name AND i.source_pk = d.pk
   WHERE i.source_pk IS NULL
  UNION ALL
  -- duplicate ledger entries for one destination id
  SELECT 'id-bijection:dup-ledger', i.source_pk, i.table_name
    FROM public.identity_import i
   GROUP BY i.table_name, i.source_pk
  HAVING count(*) > 1
)
SELECT * FROM checks;
