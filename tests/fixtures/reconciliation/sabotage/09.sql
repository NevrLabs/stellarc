-- Sabotage 09 — asset: remove one destination asset row
-- Owner: STL-27; semantics source: query #9 (asset <-> S3 bijection).
-- Named violation: asset:missing-in-dest.
DELETE FROM public.asset WHERE id = 'asset1';
