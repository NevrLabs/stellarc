-- Sabotage 05 — ticket: clobber description_history on one destination ticket
-- Owner: STL-27; semantics source: query #5 (description_history jsonb byte-exact).
-- Named violation: ticket:value-mismatch.
UPDATE public.ticket SET description_history = '[]'::jsonb WHERE id = 'task1';
