# ADR 0029 — The Resource Graph (doctrine)

- Status: Accepted
- Date: 2026-07-19
- Relates to: ADR 0005 (resource model), 0013 (workflows), 0026 (projects/boards/cards), 0027 (org visibility, sharing), 0028 (context projects)

## 1. Decision

Olympus resources form **one typed graph**. Sessions, projects, vaults,
workflows, boards, and cards are nodes; the edges already exist as FKs and
event-log links — this ADR names them as a first-class concept and forbids a
parallel store.

| Edge | Storage today | Notes |
|---|---|---|
| session →parent_of← session (fork) | `parent_session_id` + `forked_from`/`fork_point` | exists |
| session →spawned_by← session (subsession) | **new** `SessionSpawned` event → `parent_session_id` + `spawn_kind: fork\|spawn` | a spawned subsession is a distinct node with an edge to its parent; NOT a fork (no transcript copy, fresh context) |
| session →primary← project | `project_id` | immutable (ADR 0028) |
| session →context← project | `SESSION_CONTEXT_PROJECT` | ADR 0028 |
| session →tracks← card | `card_id` (card owns the whole session tree) | exists |
| project →home/references← vault, repo | ADR 0026 project revision | exists |
| board →belongs← project; card →belongs← board | ADR 0026 | exists |
| workflow →runs← sessions | ADR 0013 chain records | exists |

**No graph database, no edge table, no sync of a derived graph.** The graph
is a Hall projection over existing edges. One read endpoint:
`GET /api/graph/neighbors?node=<typed-id>&depth=N` (typed node id =
`session:<id>`, `card:<locator>`, …), org-scoped, capability-filtered per
node kind's existing rules.

## 2. Traversal is agent-native

- **Upstream:** a subsession may read its ancestor chain — parent session
  transcript (org visibility per ADR 0027 §1), the tracking card, the primary
  project's context — to clarify intent or recover context. Exposed as tools
  on the same seam as ADR 0028 §2; same fail-closed authorization, no
  transitivity beyond the named edge.
- **Downstream:** a parent session lists its children (`spawn_kind`, status,
  result summary) — the tree is the audit trail for bug hunts, deep research,
  and swarm work.
- Cross-project reference stays by-id (ADR 0028): any session id is a valid
  graph node to point at; reading it goes through its own authorization.

## 3. UI consequence (normative, minimal)

Session trees render as trees — subsessions nest under their parent in
session lists and history; the graph endpoint backs any future graph/tree
visualization. No bespoke per-view lineage queries.

## 4. Rejected

- Dedicated graph store/db — duplication of authority, second sync problem.
- Untyped generic `edges` table — every edge listed above already has an
  owner with correct authority semantics; a generic table would invite
  writes that bypass them.
