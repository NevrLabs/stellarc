# STL-21 review (cycle 16) — PR #57 (forge/stl-21 @ b4c2feb1, 80 files, +5892/−133 vs merge-base ce36b27)

Reviewer basis: gate check pass (implement pass @ 2026-09-18T00:32:58, cycle 16). Full diff vs merge-base, isolated worktree at head, unit + full integration + typecheck + biome re-run, fresh negative-control replay by this reviewer, CI check-runs at head.

**Cycle-16 headline: PR head b4c2feb1 is byte-identical to the cycle-15 review target. `git log b4c2feb1..origin/forge/stl-21` is empty; diffstat unchanged (+5892/−133). The implement stage passed with zero commits landed.** C15's single actionable defect (D8, importer preflight) is untouched. Wave-2 reality check: STL-16 PR 54 OPEN, STL-18 PR 56 OPEN, STL-20 still has no PR; STL-27 unmerged.

## VERDICT: REWORK

## Per-item audit

| # | Item | Verdict |
|---|---|---|
| 1 | Spec compliance | **DEVIATED — carried carve-out, zero progress this cycle.** Delivered: 4/8 tables (`project`, `project_slug_alias`, `project_milestone`, `project_update`) verbatim fork constraints; CRUD/slug-alias/archive + milestones + updates service→HTTP→event→collections; one-row transactional importer; 4 sync collections; live-API e2e ×4 viewports. Missing (blocked, re-verified this cycle): resource-links T08, project-tickets T10, grants/chokepoint T14, privilege predicates, T17 all-14 gate, 4/14 event types. Scope creep: none. |
| 2 | Tests that cannot fail | **PASS for what exists.** Fresh replay THIS cycle: sabotage `projects_checked` 1→999 → RED `1 failed (4)` (projects-import.test.ts); revert → GREEN `4 passed (4)`; tree clean after. T-cases name red-makers (drop check, skip alias collision, unscoped collection key, removed Effect.fn); T16 static-fixture sabotage env-gated in spec; T01b skip annotated. |
| 3 | Migrations | **PASS.** Only `0008_projects.sql` added; journal appended (2→3); `git tag --contains origin/dev` empty; no shipped migration touched; no wholesale journal rewrite. |
| 4 | Doctrine | **PASS.** `opService`→`Effect.fn` on every service fn (5+5+3); events tx-bound with actor via shared `appendProjectEventEffect`; import seeds once per org, actor `'import'`, same tx; no direct-SQL control-plane writes; no hardcoded hex; no model calls; no `console.*` in new code (`main.ts:64` = fatal handler; `verify-otel-export.mts` = T0 foundation, not this PR). |
| 5 | Worker debris | **PASS.** No stray files/TODO/debugger in new sources; screenshot adds are new baselines; no giant generated diffs. |
| 6 | Screenshots | **REWORK — carried blockers only, unchanged set.** All delivered surfaces ×4 viewports (desktop/tablet/mobile/mobile-small): overview live+static, create-modal, archive, include-archived, detail live+static, rename-slug, updates tab/published. `hasTouch` on tablet/mobile/mobile-small; CI `foundation` pass at head proves parity ≤0.001. Missing: tickets tab + resources-section surfaces — impossible pre-wave-2. |
| 7 | Spans (ADR 0010) | **PASS (delivered paths).** `http.route`/`stellarc.org`/`stellarc.principal.kind` in http.ts seam; `db.*` spans without statement text; no PII in attributes; T15 span assertions sabotage-proven (c14), suite green this cycle. |
| 8 | Gates re-run (reviewer, isolated worktree @ b4c2feb1) | **PASS.** Unit 23/23 (14.9s). Integration 7 files: **75 passed, 1 skipped** (744.6s). `tsc --noEmit` exit 0. `biome check .` exit 0 (2 infos). PR CI: `foundation` pass; `ui-typecheck-budget` fail = inherited dev ratchet noise. Negative control RED/GREEN in item 2. |

## DEFECTS (numbered, file:line, exact fix)

1. **Zero-progress cycle** — PR head unchanged (b4c2feb1); implement cycle 16 pushed no commits, yet passed. Fix: orchestrator must not mark implement pass on an unmoved PR head; re-dispatch only after wave-2 merges or spec amendment.
2. **C15 D8 unfixed — the one actionable item** — `tools/import-projects.ts:78-81` still throws `Preflight failed: satellite tables present` when satellite tables merely exist. Spec T02: "satellites empty/absent". Fix NOW (single commit, no wave-2 dependency): when a satellite table exists, assert `count(*)=0` per satellite and pass; reject only non-empty. Post-wave-2 this bug breaks every importer rerun incl. T17's three-clean-imports.
3. **4 of 8 spec tables missing** — `packages/db/migrations/0008_projects.sql` creates only dependency-free tables; `project_ticket`/`project_board`/`project_repo`/`project_table_link` absent (FK targets task/board/repo unmerged: STL-16 PR 54, STL-18 PR 56 OPEN). Fix: land satellites post wave-2 merge + renumber — or amend the spec.
4. **Resource-link surface absent (T08, "the gate item")** — no `/`:id/resources*` routes, no `project-links.ts`, no safe-summary union, no `resourceType='table'` 409. Fix: post wave-2, or formal descope.
5. **Project-ticket surface absent (T10)** — no `/:id/tickets*`, no `project-tickets.ts`, no progress computation. Fix: as 4.
6. **Grants/chokepoint extension absent (T14)** — STL-20 has no PR; `resourceType=project` acceptance + privilege chain unwired. Fix: extend when STL-20 lands, or descope.
7. **Sync collections 4/6; privilege predicates unwired** — `packages/sync/src/projects-shapes.ts` registers 4; `project_resource_link`/`project_ticket` unregistered; no caller-privilege predicate, no revocation drop. Fix: with 4/6.
8. **T17 final gate not executed** — all-14 reconciliation (STL-27 canon unmerged) + three clean full imports absent. Fix: post wave-2 + STL-27.
9. **4 of 14 event types can never fire** — `project:resource-link-*`, `project:ticket-*` are contract-only. Subsumed by 4/5.

## Not defects (checked, clean)

No-leak 404 identical bodies; alias-namespace collision; edit-history append-only; import idempotence (zero new events); `completed_by` FK restrict (fork-verbatim); mobile list skip (fork `hidden md:table`); CI PGDG/PG15 + `VITE_API_URL` + timeout bumps = legitimate infra repair; `verify-otel-export.mts` console.* predates this PR.

## Reviewer note for the orchestrator

Defects 3–9 are the same wave-2 sequencing blockers c4/c13/c14/c15 found; they cannot clear while STL-16/18/20/27 are unmerged. What changed this cycle is worse than nothing: the pipeline burned a cycle, passed implement on an identical tree, and D2's one-line-scope fix still isn't landed. Either merge wave-2 / amend the spec, or stop dispatching — and land D2 regardless; it is commit-sized and unblocks T17 later.
