-- Sabotage 06 — status: repoint one ticket's status to a deleted column slug
-- Owner: STL-27; semantics source: query #6 (zero orphan statuses).
-- Named violation: status:orphan.
-- Precondition tables: public.ticket, public.status
-- Blocked if: any of the above is absent (sabotage assumes a restored golden pair)
UPDATE public.ticket SET status = 'deleted-column-slug' WHERE id = 'task2';
