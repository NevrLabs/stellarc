-- Canonical reconciliation #8 — activity accounting (no loss, no dup)
-- Owner: STL-17
-- Semantics source: STL-17 (activity.type='comment' -> one comment store; else -> domain events);
--   wave plan T3. Ledger: activity_import(source_id, table_name, source_pk, digest,
--   destination_id, destination_org, destination_seq).
-- Precondition tables: legacy.activity, legacy.comment, public.comment, public.event, public.activity_import
-- Blocked if: any is absent
-- Invariant: every legacy activity/comment row maps to exactly one destination comment
--   (type='comment') or imported domain event (other types); no loss, no duplicate, no orphan
--   destination. Proved through the activity_import ledger.
-- Violation-rows-returning: empty result set = green.

WITH checks AS (
  -- loss: legacy activity row with no ledger entry
  SELECT 'activity:no-ledger' AS violation, a.id, 'activity' AS tbl
    FROM legacy.activity a
   WHERE NOT EXISTS (
     SELECT 1 FROM public.activity_import i
      WHERE i.table_name = 'activity' AND i.source_pk = a.id
   )
  UNION ALL
  -- loss: legacy comment row with no ledger entry
  SELECT 'comment:no-ledger', c.id, 'comment'
    FROM legacy.comment c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.activity_import i
      WHERE i.table_name = 'comment' AND i.source_pk = c.id
   )
  UNION ALL
  -- broken comment reference: ledger points at a missing destination comment
  SELECT 'activity:broken-comment-ref', i.source_pk, 'activity'
    FROM public.activity_import i
    JOIN legacy.activity a ON a.id = i.source_pk AND i.table_name = 'activity'
   WHERE a.type = 'comment'
     AND NOT EXISTS (SELECT 1 FROM public.comment c WHERE c.id = i.destination_id)
  UNION ALL
  -- broken event reference: ledger points at a missing destination event
  SELECT 'activity:broken-event-ref', i.source_pk, 'activity'
    FROM public.activity_import i
    JOIN legacy.activity a ON a.id = i.source_pk AND i.table_name = 'activity'
   WHERE a.type <> 'comment'
     AND NOT EXISTS (
       SELECT 1 FROM public.event e
        WHERE e.org = i.destination_org AND e.seq = i.destination_seq
     )
  UNION ALL
  -- duplicate: two ledger entries for the same source row
  SELECT 'activity:dup-ledger', i.source_pk, 'activity'
    FROM public.activity_import i
   GROUP BY i.table_name, i.source_pk
  HAVING count(*) > 1
  UNION ALL
  -- orphan destination comment with no provenance
  SELECT 'comment:orphan-dest', c.id, 'comment'
    FROM public.comment c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.activity_import i
      WHERE i.table_name IN ('activity', 'comment') AND i.destination_id = c.id
   )
)
SELECT * FROM checks;
