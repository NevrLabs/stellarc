-- Sabotage 02 — identity-team: remove one destination team_member
-- Owner: STL-27; semantics source: query #2 (PK-set equality).
-- Named violation: team_member:missing-in-dest.
-- Precondition tables: public.team_member
-- Blocked if: any of the above is absent (sabotage assumes a restored golden pair)
DELETE FROM public.team_member WHERE id = 'tm1';
