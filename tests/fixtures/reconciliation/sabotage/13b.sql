-- Sabotage 13b — id bijection: destination row with no ledger entry
-- Owner: STL-27; semantics source: query #13 (id bijection).
-- Named violation: id-bijection:dest-no-ledger.
DELETE FROM public.identity_import WHERE table_name = 'organization_role' AND source_pk = 'r1';
