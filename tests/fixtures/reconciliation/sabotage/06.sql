-- Sabotage 06 — status: repoint one ticket's status to a deleted column slug
-- Owner: STL-27; semantics source: query #6 (zero orphan statuses).
-- Named violation: status:orphan.
UPDATE public.ticket SET status = 'deleted-column-slug' WHERE id = 'task2';
