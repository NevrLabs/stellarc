-- Sabotage 14b — apikey hash: re-issue state without audit event
-- Owner: STL-27; semantics source: query #14 (fallback arm requires one reissue event).
-- Named violation: apikey:reissued-no-event.
-- Precondition tables: public.apikey
-- Blocked if: any of the above is absent (sabotage assumes a restored golden pair)
UPDATE public.apikey
   SET key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
 WHERE id = 'k2';
