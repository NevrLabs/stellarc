-- Sabotage 04 — board: corrupt one destination board name
-- Owner: STL-27; semantics source: query #4 (all-column fidelity).
-- Named violation: board:value-mismatch.
-- Precondition tables: public.board
-- Blocked if: any of the above is absent (sabotage assumes a restored golden pair)
UPDATE public.board SET name = '__SABOTAGE__' WHERE id = 'b1';
