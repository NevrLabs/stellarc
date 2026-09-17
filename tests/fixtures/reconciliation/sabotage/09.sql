-- Sabotage 09 — asset: remove one destination asset row
-- Owner: STL-27; semantics source: query #9 (asset <-> S3 bijection).
-- Named violation: asset:missing-in-dest.
-- Precondition tables: public.asset
-- Blocked if: any of the above is absent (sabotage assumes a restored golden pair)
DELETE FROM public.asset WHERE id = 'asset1';
