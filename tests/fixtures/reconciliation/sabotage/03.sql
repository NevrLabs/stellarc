-- Sabotage 03 — apikey: flip enabled state on one destination key
-- Owner: STL-27; semantics source: query #3 (enabled/rate-limit state preserved).
-- Named violation: apikey:value-mismatch.
UPDATE public.apikey SET enabled = NOT enabled WHERE id = 'k1';
