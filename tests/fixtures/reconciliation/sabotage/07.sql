-- Sabotage 07 — relations: introduce a directed cycle into task_relation
-- Owner: STL-27; semantics source: query #7 (acyclic directed relations).
-- Named violation: relation:cycle.
INSERT INTO legacy.task_relation (id, source_task_id, target_task_id, relation_type, created_at)
VALUES ('tr-cycle', 'task2', 'task1', 'blocks', now());
