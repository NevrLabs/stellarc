-- Sabotage 13a — id bijection: two ledger entries claim one destination id
-- Owner: STL-27; semantics source: query #13 (id bijection).
-- Named violation: id-bijection:dup-ledger.
-- Precondition tables: public.identity_import
-- Blocked if: any of the above is absent (sabotage assumes a restored golden pair)
INSERT INTO public.identity_import (source_id, table_name, source_pk, digest)
SELECT 'run-2', table_name, source_pk, digest
  FROM public.identity_import
 WHERE table_name = 'user' AND source_pk = 'u1';
