-- Sabotage 10 — repository: corrupt one destination repo_issue state
-- Owner: STL-27; semantics source: query #10 (all-column fidelity).
-- Named violation: repo_issue:value-mismatch.
-- Precondition tables: public.repo_issue
-- Blocked if: any of the above is absent (sabotage assumes a restored golden pair)
UPDATE public.repo_issue SET state = '__SABOTAGE__' WHERE id = 'issue1';
