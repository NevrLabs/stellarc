-- Sabotage 13b — id bijection: destination row with no ledger entry
-- Owner: STL-27; semantics source: query #13 (id bijection).
-- Named violation: id-bijection:dest-no-ledger.
-- Precondition tables: public.identity_import
-- Blocked if: any of the above is absent (sabotage assumes a restored golden pair)
DELETE FROM public.identity_import WHERE table_name = 'organization_role' AND source_pk = 'r1';
