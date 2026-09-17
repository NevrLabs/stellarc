# STL-15 — Adversarial review (cycle 3)

**Verdict: REWORK**

Diff reviewed: `8942e21..f876539` (PR #42, 29 files, +3970/−58; contains c1+c2+c3 cumulative). Base `dev` tip carries the STL-31 migration/contracts; this PR adds the domain services, importer preflight, HTTP reads, Better Auth layer and production mounting. The PR is honest about scope (`.forge-notes-c3.md` lists what is NOT claimed) — the review confirms those gaps are real and finds additional defects in shipped code.

## Per-item verdicts

| # | Audit item | Verdict | Evidence |
|---|---|---|---|
| 1 | Spec compliance | **FAIL** | Implemented: ten-table importer + preflight + ledger + per-table events (T23–T25), digest auth (T04/T05), OrgRouter (T08), org-create seeding (T34), member-delete + LastOwner (T14), Better Auth sign-in/out/session (T02/T03), HTTP reads + active-org + avatar (T07/T22/T29 partial). Missing/deviated: 19 of 26 §3 endpoints (all role/team/invitation/apikey writes, team-member CRUD, accept-invitation, PATCH member/org, GET team members); §4 shapes/collections entirely absent; §6 UI wiring + e2e + screenshots absent; §5 files `identity-shapes.ts`, `identity-collections.ts`, `identity-client.ts`, `tools/import-identity.ts`, `tests/helpers/identity-fixture.ts`, `identity-telemetry.test.ts` absent. Reconciliation fixture correctly NOT invented (canonical SQL still unsupplied — c1 `.forge-question.md` unanswered). Scope creep: none found. |
| 2 | Tests that cannot fail | PARTIAL | Shipped tests are behavioral (DB-backed, real handler). Replay results below (T25 preflight sabotage → 3 RED; T07 membership-predicate sabotage → foreign-org test RED). Weak spot: T06 (`tests/unit/identity.test.ts:110`) still asserts grants *written*, never ceiling *intersection* — the spec's "union rather than intersect" control is inexpressible because no ceiling exists in the implementation (defect 2/17). T23 compares sampled columns (account/apikey/avatar/team-parent), not all ten PK sets/values (defect 8). |
| 3 | Migrations | OK | No migration file touched by the PR (`git diff origin/dev...HEAD --name-only -- packages/db/` empty); `0001/0002` land at base from STL-31. `git tag --contains 8942e21` → none (no tags exist); nothing shipped was reformatted. |
| 4 | Doctrine | **FAIL** | `authenticateApiKey` (auth.ts:118–149) writes principal + identity_grant rows (incl. per-permission capabilities) with **no events** — mutation-without-event; also outside any projection. HTTP authz is membership-role string matching on `ctx.userId`, which for x-api-key requests is the **owner's** id — an agent key exercises full owner authority (defect 2). No direct-SQL bypass of the API beyond the sanctioned importer/maintenance paths; importer uses explicit maintenance actor. `auth-http.ts:13` hardcodes a test CORS origin into the production wrapper (defect 5). |
| 5 | Worker debris | FAIL (host, not repo) | Repo clean: no console.* added (main.ts:85 `console.error` is inherited from dev), no commented-out code, no stray files committed. Host: `/tmp/dbg-worker2.ts` — an unbounded debug loop importing this lane's `tests/helpers/postgres`, running at ~117% CPU since Sep 14 (~20 h), caused initdb hook timeouts in integration runs. **Killed by reviewer (PID 2097064).** |
| 6 | Screenshots | **FAIL** | Zero identity screenshots; no `apps/stellarc-ui/e2e/identity.spec.ts`; no UI wiring at all. No viewport was exercised. (Inherited baselines under `__screenshots__/` untouched — nothing regenerated, which is correct, but nothing proven either.) |
| 7 | Spans (ADR 0010) | **FAIL** | Zero `Effect.fn("Module.name")` on any new service (`authenticateApiKey`, `importIdentity`, `createOrganization`, `removeMember`, `appendEvents`, `orgRouter`, `resolveRequestContext`, the whole `identity-http` handler, better-auth adapter). No http.route/method/status/stellarc.org/stellarc.principal.kind attributes. No span-assertion test (`identity-telemetry.test.ts` absent). Explicitly declared not-done by implementer — confirmed. |
| 8 | Re-run gates | PASS w/ caveat | `bun run lint` → 0 errors (exit 0). `bun run typecheck` → exit 0. Unit: `vitest run --config vitest.config.ts` → **43/43, exit 0** (173 s). Integration per-file (quiet host): identity-http **8/8**, identity-auth **6/6**, identity-migration **8/8**, foundation **43/43** — all exit 0. Full-suite single run under host load 5–6: 8 failed (initdb hook timeouts, shifting targets — co-run artifact; also 743 s > the 600 s gate timer, see defect 18 note). `bun run build` not re-run by reviewer. |

## Negative-control replays (reviewer-executed)

**T25 — spec sabotage "commit each table before preflight completes" (preflight call removed),** `import.ts:506`:
```
RED:   × T25 preflight aborts duplicate source pairs … / × broken FK references … / × malformed permission JSON …  (3 failed | 1 passed, exit 1)
GREEN: restore → tests/unit/identity-import-preflight.test.ts 4/4 (full unit suite 43/43)
```

**T07 — membership predicate removed** (`identity-http.ts:308` guard deleted, module still parsing):
```
RED:   × foreign-org member list is the same 404 as an absent org (§3)  (1 failed | 7 passed, exit 1)
GREEN: restore → tests/integration/identity-http.test.ts 8/8 (exit 0)
```
Both controls turn the asserted tests red — the suites are not decorative.

## DEFECTS

1. `apps/stellarc-api/src/identity-http.ts:402-406` — `GET /orgs/:org/apikeys` ignores `:org`: query is `WHERE reference_id = ${ctx.userId}` only; the same global key list returns for every org the user belongs to. Spec §3: "own keys only, **scoped to org**". Fix: scope the listing to the resolved org (via key grants/membership semantics per §2), not a global owner dump.
2. `apps/stellarc-api/src/identity-http.ts:348,379` + `apps/stellarc-api/src/identity-context.ts:71-78` — authorization is membership-role string matching on `ctx.userId`; for `x-api-key` requests `ctx.userId` is the key owner's id, so an **agent key wields full owner authority** (member removal, invitation reads, org discovery). §2: effective agent capability = membership ∩ **key ceiling** ∩ structural grant. Fix: authorize on `ctx.principalId`'s identity_grant capabilities intersected with the key permission ceiling; never reuse the owner's human membership for agent authz.
3. `packages/domain/src/identity/auth.ts:72-81` — key path never checks owner `banned` (session path does at identity-context.ts:99); `refill_interval`/`refill_amount` ignored (only window reset implemented). Fix: join `user.banned` into the key SELECT and deny; implement refill semantics.
4. `packages/domain/src/identity/auth.ts:118-149` — principal + identity_grant inserts emit **no** `identity:principal-upserted`/`identity:grant-upserted` events (mutation-without-event, D-check). Fix: append events in the same transaction via `appendEvents`.
5. `apps/stellarc-api/src/auth-http.ts:13` — hardcoded CORS origin `http://127.0.0.1:4173` (a test origin) in the production auth wrapper; spec §3 allows cookie credentials "only for configured origins". Fix: derive from `AuthConfig.publicOrigin`.
6. `packages/domain/src/identity/import.ts:795-808` — `team_member` (and any non-org column table without a special case) events key to `[...userOrgs.values()][0]` — an arbitrary org; with multiple orgs the row streams to the wrong org. Fix: resolve team_member → team.organization_id (and delete the fallback branch).
7. `packages/domain/src/identity/import.ts:511-561` — every team row increments `changed` twice (pass 1 ledger `team` + pass 2 ledger `team#parent`); report `changed`/`identical` are wrong for any fixture with teams. Fix: count distinct (ledger-table, pk) once, or exclude the backfill pass from counters.
8. `packages/domain/src/identity/import.ts` (importIdentity) — spec §2 "compare all ten source/destination PK sets and values" is not implemented anywhere; `tests/unit/identity.test.ts:130` (T23) verifies sampled rows only. Fix: add the post-apply ten-table source/destination comparison (including destination-extras) before reporting success.
9. `apps/stellarc-api/src/identity-http.ts:410` — unsupported method on a known path returns 404, never 405 (§3 error contract). Fix: 405 (+Allow) when the path matches a registered route with another method.
10. `apps/stellarc-api/src/identity-http.ts:238` — `slug` checked nonempty only, unbounded length (§3 bounded ≤256; `name` is bounded). Fix: apply the bounded-name validation to slug.
11. SPANS (ADR 0010 / T30 / T31) — zero instrumentation on all new services and routes; no http.route/method/status/stellarc.org/stellarc.principal.kind attributes; no span-assertion test (`tests/integration/identity-telemetry.test.ts` missing from manifest). Fix: `Effect.fn("Module.name")` every new service function; span attributes on endpoints; telemetry contract tests with instrumentation-removal negative control.
12. Missing §3 write surface (19 endpoints): role POST/PATCH/DELETE; team POST/PATCH/DELETE (+ reparent child-upsert/member-deletion events in tx); team members GET/POST/DELETE; invitation POST/cancel/**accept** (atomic consume/membership/team/grants); apikey POST (one-time secret, digest, ceiling ≤ issuer) /DELETE (immediate grant revocation); PATCH member role; PATCH org (slug change instance-admin-only). File: `apps/stellarc-api/src/identity-http.ts`. Fix: implement with §3 error union + `{data,txid}` envelopes.
13. §4 sync shapes/collections absent — `packages/sync/src/identity-shapes.ts`, `apps/stellarc-ui/src/lib/identity-collections.ts`, `identity-client.ts` not created; `/orgs/:org/v1/shape` has no identity allowlist; revocation-driven handle invalidation unimplemented. Fix: implement §4 (scope-bound handles, live collections, no old-org cache reuse).
14. §6 frozen UI absent — no UI MODIFY wiring, no `apps/stellarc-ui/e2e/identity.spec.ts`, zero screenshots at any of the four inherited viewports. Fix: wire sign-in → switch → Members/Teams/Roles/Keys against the live API and produce reviewed-baseline screenshot parity.
15. `tests/fixtures/identity-reconciliation.sql` + T26–T28 — **orchestrator blocker, not implementer fault**: canonical SQL #1–#3 never supplied (c1 `.forge-question.md` still unanswered). Must remain an explicit handoff blocker; T26–T28 must not be marked green or skipped-green.
16. Lane debris (host): `/tmp/dbg-worker2.ts` — runaway debug loop from this lane (117% CPU ≈ 20 h) causing integration initdb timeouts; killed by reviewer. Fix: implementers must not leave unbounded /tmp probe loops; orchestrator should reap lane processes at exit.
17. `tests/unit/identity.test.ts:110` (T06) — test asserts grants written, not that the key ceiling caps agent capability; the spec's "union rather than intersect" negative control is currently inexpressible (no intersection exists — see defect 2). Fix: after defect 2 lands, add the agent-escalation-denied test and its union-sabotage control.

Note (not a defect): `tests/gates.test.ts` 600 s timer vs my loaded-host full-integration run at 743 s — under parallel-lane load the gate can kill mid-flight; per-file runs stay green. The skill already documents co-run partitioning; keep the timer but partition under load.

## Bottom line

The shipped slice is genuinely tested and mostly sound at the domain layer, but the ticket is nowhere near its spec: no writes beyond two mutations, no shapes, no UI, no spans, and a real authorization-model defect (agent keys inherit owner authority) that must be fixed before any of the missing surfaces are built on top of it. REWORK.
