-- Sabotage 14a — apikey hash: corrupt one stored hash encoding without an event
-- Owner: STL-27; semantics source: query #14 (hash verifies OR reissue event).
-- Named violation: apikey:invalid-hash-no-event (+ apikey:reissued-no-event).
-- Precondition tables: public.apikey
-- Blocked if: any of the above is absent (sabotage assumes a restored golden pair)
UPDATE public.apikey SET key = 'INVALID-HASH!!' WHERE id = 'k1';
