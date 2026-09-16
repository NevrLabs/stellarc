# STL-15 review — cycle 9 (PR #53, head eda1f82c, base dev 5856c24)

VERDICT: REWORK

Reviewer: gate checked (latest implement = pass, cycle 9, PR 53). Diff audited at head in an
isolated worktree; gates re-run; one negative control replayed; one live behavioral probe run.

## Per-item audit

| # | Item | Verdict |
|---|---|---|
| 1 | SPEC COMPLIANCE | PARTIAL — importer (preflight/ledger/idempotence/D8 verify), real Better Auth bcrypt sign-in/session/sign-out, ~26 §3 endpoints incl. writes, error union, avatar serving, atomic API-key rate gate, OrgRouter are implemented. MISSING: §4 sync shapes/collections entirely (no identity-shapes.ts / identity-collections.ts / identity-client.ts, no shape allowlist, no §4 projection registration); §5 UI MODIFY list — zero files under apps/stellarc-ui touched; §6 frozen surfaces — untouched; `tools/import-identity.ts`, `tests/helpers/identity-fixture.ts`, `tests/fixtures/identity-reconciliation.sql` (orchestrator-blocked: canonical #1–#3 never supplied — correctly NOT counterfeited, but T26–T28 remain blocked test specs); MODIFY-list files untouched: `packages/domain/src/authz.ts`, `packages/db/src/index.ts`, `packages/contracts/src/api.ts`, `packages/sync/src/*`, `apps/stellarc-api/src/errors.ts`; shape endpoint identity allowlist not done. Implementer's own notes (.forge-notes-c4.md) concede spans/shapes/UI/reconciliation are "NOT claimed done" — yet implement was marked pass. |
| 2 | TESTS THAT CANNOT FAIL | MIXED. T04 control replayed by reviewer: digest switched to hex → `tests/unit/identity.test.ts` 4 RED (known-answer, raw-verify, hex-reject, scope) → restored → 7/7 GREEN. Genuine assertion-based tests throughout. BUT the central D2/D1 authorization tests are masked: `tests/integration/identity-http.test.ts:57-81` hand-seeds the full owner capability set into identity_grant — state no production path ever creates (see D1 live probe). The suite proves the fixture, not the system. No tests exist for spans (T30/T31), shapes (T09/T11/T12/T19/T21/T33/T35), UI (T32), reconciliation (T26-28, blocked). |
| 3 | MIGRATIONS | CLEAN — no modified/deleted migrations. `0002_identity.sql` landed via STL-31 (#37) before this branch; blob identical on merge-base and dev; this PR does not touch packages/db. No journal reformat. |
| 4 | DOCTRINE | VIOLATIONS — (a) `authenticateApiKey` (auth.ts:124-190) mutates `principal` + `identity_grant` with NO events and NO actor — mutation-without-event on every authenticated request (hot path, own transaction per request); (b) importer appends events with actor = literal string `"identity-importer"` (import.ts:925), not an explicit maintenance principal.id (§2); (c) new business logic lives in plain Bun handlers + raw postgres.js, not Effect services — T0's Effect HttpApi layer bypassed; (d) runtime mutation events carry `{id}` only, not the §2 `{id, row}` contract (importer does rows; runtime paths don't). |
| 5 | WORKER DEBRIS | MINOR — `AUTH_IMPL_VERSION` dead export (auth.ts:2, zero importers); CJS `require()` inside ESM `validPermission` (identity-http.ts:94, Bun-only, breaks under node/vitest-node); root + domain package.json wholesale reformat (tabs→spaces, whole-file diff churn); `.gitignore` drops `.forge/runs/` (likely orchestrator-side; flag for confirmation). No stray debug logs — console.* scan clean in new files. |
| 6 | SCREENSHOTS | MISSING — zero screenshot artifacts for any surface or any Playwright project (desktop/tablet/mobile/mobile-small). No `apps/stellarc-ui/e2e/identity.spec.ts`. Per this review's own rule: REWORK. |
| 7 | SPANS (ADR 0010) | FAIL — zero `Effect.fn("...")` in every new file (auth.ts, capabilities.ts, mutations.ts, org-router.ts, import.ts, identity-http.ts, auth-http.ts, identity-context.ts, better-auth*.ts). No http.route/method/status, no stellarc.principal.kind attributes anywhere. `tests/integration/identity-telemetry.test.ts` (manifest) does not exist; T30/T31 have zero coverage. No console.* leakage or PII in spans (nothing to leak — no spans). |
| 8 | GATES RE-RUN (isolated worktree @ eda1f82c) | `bun install --frozen-lockfile` OK; `bun run lint` clean (7 pre-existing warnings); `bun run typecheck` clean; unit 44/44 pass (271s); integration 70/71 — `foundation.test.ts T01 shape spans` failed in full-file run twice, PASSES isolated in 11.6s; code path (packages/sync) untouched by this PR → recorded as load/environment flake, not billed. Negative control + live probe output below. |

### Live probe (reviewer-executed, disposable PG, production paths only)

```
bun /tmp/capcheck.ts
org created: org_LapGlpGLLVEm2wtf-aFBx4aA txid 726
structural grants seeded by production path: [ "org:member" ]
effective caps for the ORGANIZATION OWNER: [ "org:member" ]
can delete a member (member:delete)? false
can manage members (organization:manage_members)? false
```

### Negative control replay (T04)

```
sabotage: digest("base64url") → digest("hex")
 ❯ tests/unit/identity.test.ts (7 tests | 4 failed)
   × T04 apiKeyDigest matches the SHA-256 base64url known-answer vector exactly
   × T04 authenticateApiKey verifies raw key against stored b64url digest...
   × T04 hex-encoded digest does not authenticate (encoding not padded/hex)
   × T06 key scope derives exactly one agent principal...
restore → Tests 7 passed (7)
```

## DEFECTS

1. **[CRITICAL] Human authorization broken in production.** `packages/domain/src/identity/capabilities.ts:170` intersects role caps with structural grants, but every production seeding path writes only `org:member` for humans: `createOrganization` (mutations.ts:113-116), `acceptInvitation` (mutations.ts:~723-731), importer (import.ts:869-877). Live-verified: a fresh org OWNER cannot remove a member or manage anything (`member:delete`=false, `organization:manage_members`=false). Spec §2: "Humans use membership role **plus** structural grant." Tests mask it by hand-seeding full ownerCaps (identity-http.test.ts:57-81). FIX: union role capability with structural grants for humans per spec (or seed the complete role-capability grant set on every membership-granting path); add a live test that exercises createOrganization→owner-manages without manual grant seeding.
2. **[CRITICAL] §4 sync shapes/collections entirely missing.** No `packages/sync/src/identity-shapes.ts`, no `apps/stellarc-ui/src/lib/identity-collections.ts` / `identity-client.ts`, no shape table allowlist, no /orgs/:org/v1/shape identity support. T09/T11/T12/T19/T21/T33/T35 uncovered. FIX: implement §4 in full before this ticket can leave review.
3. **[CRITICAL] §5 UI MODIFY + §6 frozen surfaces + T32 absent.** Zero changes under apps/stellarc-ui; no e2e/identity.spec.ts; zero screenshots at any of the four inherited viewports; Members-not-live-against-built-API criterion untested. FIX: wire the §5 UI MODIFY list and deliver fork-baseline-verified screenshots per §6.
4. **[CRITICAL] ADR 0010 spans absent.** No `Effect.fn` on any new service function; no endpoint span attributes; `tests/integration/identity-telemetry.test.ts` not created (T30/T31). FIX: instrument every new/changed service function and endpoint (http.route/method/status, stellarc.org, stellarc.principal.kind) and add telemetry contract tests that go red when instrumentation is removed.
5. **[MAJOR] `authenticateApiKey` is an unaccounted grant engine.** auth.ts:124-190: on EVERY request it (a) provisions the agent principal, (b) self-grants the key's own permission ceiling as structural grants in **every org the owner belongs to** (not just the issuing org), (c) emits no events, no actor. Imported legacy keys thereby gain all-owner-org access derived from their own ceiling — spec: imported keys "never gain all-org access". Combined with defect 6, a key minted in org A carries member:delete into org B; `deleteApiKey` revokes in one org only, and the next request re-grants everywhere. FIX: grants derive only at key creation/import in the issuing org; authentication must be read-only (or emit actor-tagged events); revoke must sweep all orgs.
6. **[MAJOR] API-key creation never checks "ceiling ≤ issuer capabilities".** mutations.ts:802 comment claims it; no code intersects requested permissions with the issuer's effective capabilities. A restricted issuer can mint an owner-level key. FIX: intersect requested permission set with `effectiveCapabilities(issuer)` and reject excess (Conflict/ValidationError) in the same transaction.
7. **[MAJOR] Event payloads violate §2 contracts on runtime paths.** All runtime mutations emit `{id}` only (mutations.ts:138,220,294,333,364,397,453,502,550,820); spec requires `{id, row: <Public row>}` for member/role/team/team-member/invitation/apikey upserts. Projections cannot be rebuilt from runtime events. FIX: include the allowlisted public row in every upsert event emitted by mutations.ts.
8. **[MAJOR] `removeMember` leaves stale structural grants.** mutations.ts:216 deletes the member row but not `identity_grant` rows for `human:<userId>`; stale grants keep `GET /orgs/:org/apikeys` EXISTS-guard and any future grant-consuming surface alive for a removed member (T12 partial). FIX: delete the human principal's grants in the same tx and emit matching `identity:grant-deleted` events.
9. **[MAJOR] Importer actor is a string literal.** import.ts:925 appends events with actor `"identity-importer"`, not an explicit maintenance principal.id (§2 "fixture import uses an explicit maintenance principal"). FIX: create/reuse a maintenance principal row and use its principal.id as actor.
10. **[MODERATE] "Reject excess write keys" not implemented.** `readJson` (identity-http.ts:129-137) accepts arbitrary extra keys on every write endpoint; the file-header comment (line 30) claims rejection. §3 requires rejection. FIX: per-route allowed-key sets, 400 on extras.
11. **[MODERATE] Manifest files missing.** `tools/import-identity.ts` (CLI/ops entry) and `tests/helpers/identity-fixture.ts` were never created; importer reachable only by direct module import in tests. FIX: add both per §5.
12. **[MODERATE] `require()` in ESM.** identity-http.ts:94 uses CJS `require()` inside `validPermission` — functions under Bun only; breaks any node-based runner and is debris. FIX: hoist to a static ESM import.
13. **[MINOR] Dead code.** `AUTH_IMPL_VERSION` (auth.ts:2) exported, never imported. FIX: delete.
14. **[MINOR] package.json churn.** Root and `packages/domain/package.json` rewritten tabs→spaces (whole-file diff; biome excludes package.json so it will not be normalized back). FIX: restore tab indentation to keep diffs minimal.

## Notes (not billed)

- T26–T28 reconciliation fixture remains orchestrator-blocked (canonical SQL #1–#3 never supplied); implementer correctly refused to invent queries — this is a handoff blocker to resolve before final acceptance, not an implementer defect.
- `foundation.test.ts` T01 tail-span assertion failed in two full-file integration runs, passed isolated in 11.6s; packages/sync untouched by this PR → environment/load flake. Recommend the orchestrator's clean-worktree full gate arbitrate.
- Gate-timeout increases (gates 600s, vitest 120s hooks, maxWorkers 1) are documented, load-driven and acceptable.
- Integration tests boot real Better Auth + disposable PG + run real migrations; unauthenticated fail-closed, 404-parity, 405+Allow, T14 concurrency, T18 conditional consume are genuinely assertive — good work buried under the missing halves.

**Conclusion:** the implemented half (importer, auth, HTTP surface) is real and mostly well-tested, but the PR is roughly half the ticket: no shapes, no UI, no screenshots, no spans, and a live-breaking human-authorization defect that the test fixtures actively conceal. REWORK.
