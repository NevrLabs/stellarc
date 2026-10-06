-- Sabotage 11 — grants: change one destination grant's privilege
-- Owner: STL-27; semantics source: query #11 (same (principal, resource), equal privilege).
-- Named violation: resource_grant:privilege-mismatch.
-- Precondition tables: public.resource_grant
-- Blocked if: any of the above is absent (sabotage assumes a restored golden pair)
UPDATE public.resource_grant SET privilege = 'view' WHERE id = 'rg1';
