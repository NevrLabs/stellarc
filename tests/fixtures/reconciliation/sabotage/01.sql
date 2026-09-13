-- Sabotage 01 — identity-core: corrupt one destination user value
-- Owner: STL-27; semantics source: query #1 (all-column fidelity).
-- Named violation: user:value-mismatch.
UPDATE public."user" SET name = '__SABOTAGE__' WHERE id = 'u1';
