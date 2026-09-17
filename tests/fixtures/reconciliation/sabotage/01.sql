-- Sabotage 01 — identity-core: corrupt one destination user value
-- Owner: STL-27; semantics source: query #1 (all-column fidelity).
-- Named violation: user:value-mismatch.
-- Precondition tables: public."user"
-- Blocked if: any of the above is absent (sabotage assumes a restored golden pair)
UPDATE public."user" SET name = '__SABOTAGE__' WHERE id = 'u1';
