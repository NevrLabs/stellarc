-- Canonical reconciliation #7 — ticket graph fidelity + acyclicity
-- Owner: STL-19
-- Semantics source: wave plan T5 (directional relations, cycle protection, unified entity_link);
--   STL-19 spec in flight — entity_link contract is PROVISIONAL, rebind on STL-19 merge.
-- Precondition tables: legacy.task_relation, legacy.task_follower, legacy.external_link,
--   legacy.task_repo_item_link, legacy.milestone; public.entity_link, public.milestone
-- Blocked if: any is absent
-- Invariant: the four legacy link tables map faithfully into the unified public.entity_link
--   (kind discriminator), legacy milestone maps to public.milestone, and the directed
--   relation graph (source_task_id -> target_task_id) is acyclic.
-- Violation-rows-returning: empty result set = green.

WITH checks AS (
  -- relation fidelity
  SELECT 'entity_link:relation:missing-in-dest' AS violation, s.id, 'task_relation' AS tbl
    FROM legacy.task_relation s
    LEFT JOIN public.entity_link d
      ON d.kind = 'relation'
     AND d.source_task_id = s.source_task_id
     AND d.target_task_id = s.target_task_id
   WHERE d.id IS NULL
  UNION ALL
  SELECT 'entity_link:relation:extra', d.id, 'task_relation'
    FROM public.entity_link d
    LEFT JOIN legacy.task_relation s
      ON s.source_task_id = d.source_task_id
     AND s.target_task_id = d.target_task_id
   WHERE d.kind = 'relation' AND s.id IS NULL
  UNION ALL
  SELECT 'entity_link:relation:type-mismatch', s.id, 'task_relation'
    FROM legacy.task_relation s
    JOIN public.entity_link d
      ON d.kind = 'relation'
     AND d.source_task_id = s.source_task_id
     AND d.target_task_id = s.target_task_id
   WHERE s.relation_type IS DISTINCT FROM d.relation_type
  -- follower fidelity
  UNION ALL
  SELECT 'entity_link:follower:missing-in-dest', s.id, 'task_follower'
    FROM legacy.task_follower s
    LEFT JOIN public.entity_link d
      ON d.kind = 'follower' AND d.source_task_id = s.task_id AND d.target_user_id = s.user_id
   WHERE d.id IS NULL
  UNION ALL
  SELECT 'entity_link:follower:extra', d.id, 'task_follower'
    FROM public.entity_link d
    LEFT JOIN legacy.task_follower s ON s.task_id = d.source_task_id AND s.user_id = d.target_user_id
   WHERE d.kind = 'follower' AND s.id IS NULL
  -- external link fidelity
  UNION ALL
  SELECT 'entity_link:external:missing-in-dest', s.id, 'external_link'
    FROM legacy.external_link s
    LEFT JOIN public.entity_link d
      ON d.kind = 'external' AND d.source_task_id = s.task_id AND d.external_id = s.external_id
   WHERE d.id IS NULL
  UNION ALL
  SELECT 'entity_link:external:extra', d.id, 'external_link'
    FROM public.entity_link d
    LEFT JOIN legacy.external_link s ON s.task_id = d.source_task_id AND s.external_id = d.external_id
   WHERE d.kind = 'external' AND s.id IS NULL
  -- repo item link fidelity
  UNION ALL
  SELECT 'entity_link:repo_item:missing-in-dest', s.id, 'task_repo_item_link'
    FROM legacy.task_repo_item_link s
    LEFT JOIN public.entity_link d
      ON d.kind = 'repo_item' AND d.source_task_id = s.task_id
     AND d.repo_issue_id IS NOT DISTINCT FROM s.repo_issue_id
     AND d.repo_pull_request_id IS NOT DISTINCT FROM s.repo_pull_request_id
   WHERE d.id IS NULL
  UNION ALL
  SELECT 'entity_link:repo_item:extra', d.id, 'task_repo_item_link'
    FROM public.entity_link d
    LEFT JOIN legacy.task_repo_item_link s
      ON s.task_id = d.source_task_id
     AND s.repo_issue_id IS NOT DISTINCT FROM d.repo_issue_id
     AND s.repo_pull_request_id IS NOT DISTINCT FROM d.repo_pull_request_id
   WHERE d.kind = 'repo_item' AND s.id IS NULL
  -- milestone fidelity
  UNION ALL
  SELECT 'milestone:missing-in-dest', s.id, 'milestone'
    FROM legacy.milestone s LEFT JOIN public.milestone d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'milestone:missing-in-src', d.id, 'milestone'
    FROM public.milestone d LEFT JOIN legacy.milestone s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'milestone:value-mismatch', s.id, 'milestone'
    FROM legacy.milestone s JOIN public.milestone d ON d.id = s.id
   WHERE s.board_id IS DISTINCT FROM d.board_id
      OR s.name IS DISTINCT FROM d.name
      OR s.description IS DISTINCT FROM d.description
      OR s.due_date IS DISTINCT FROM d.due_date
      OR s.status IS DISTINCT FROM d.status
      OR s.position IS DISTINCT FROM d.position
  -- acyclicity: a cycle exists iff a task is reachable from itself
  UNION ALL
  SELECT 'relation:cycle', r.cur, 'task_relation'
    FROM (
      WITH RECURSIVE reach(src, cur, depth) AS (
        SELECT source_task_id, target_task_id, 1
          FROM legacy.task_relation
        UNION ALL
        SELECT r.src, t.target_task_id, r.depth + 1
          FROM reach r
          JOIN legacy.task_relation t ON t.source_task_id = r.cur
         WHERE r.depth < 1000
      )
      SELECT DISTINCT cur FROM reach WHERE src = cur
    ) r
)
SELECT * FROM checks;
