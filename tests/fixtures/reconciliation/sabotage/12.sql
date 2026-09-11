-- Sabotage 12 — isolation: reassign one grant to a different organization
-- Owner: STL-27; semantics source: query #12 (cross-org isolation).
-- Named violation: isolation:grant-board-org-leak.
UPDATE public.resource_grant SET organization_id = 'o2' WHERE id = 'rg1';
