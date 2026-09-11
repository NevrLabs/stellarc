-- Sabotage 08 — activity: drop the ledger entry for one legacy activity row
-- Owner: STL-27; semantics source: query #8 (no loss/dup).
-- Named violation: activity:no-ledger.
DELETE FROM public.activity_import WHERE table_name = 'activity' AND source_pk = 'act1';
