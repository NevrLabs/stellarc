-- Sabotage 02 — identity-team: remove one destination team_member
-- Owner: STL-27; semantics source: query #2 (PK-set equality).
-- Named violation: team_member:missing-in-dest.
DELETE FROM public.team_member WHERE id = 'tm1';
