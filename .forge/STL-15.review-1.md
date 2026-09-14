# STL-15 — Adversarial review (cycle 1)

**Verdict: REWORK**

Diff reviewed: `5779c55..faf7b14` (PR #39, 15 files, +2016/−53). Head `faf7b14`. Base `dev` tip `5779c55` already carries the STL-31 foundation (migration `0002_identity.sql`, `packages/contracts/src/identity/*` with 26 defined-but-unhandled endpoints, `legacy/permissions`). This PR is a *structural-core slice*, not the STL-15 spec.

## Per-item verdicts

| # | Audit item | Verdict | Evidence |
|---|---|---|---|
| 1 | Spec compliance | **FAIL** | Only auth digest, OrgRouter, create-org/remove-member mutations, importer, and auth routes exist. §3 HTTP handlers (26 endpoints), §4 sync shapes/live collections, §6 frozen UI + e2e + screenshots, §5 `identity-http.ts`/`identity-shapes.ts`/`identity-events.ts`/`tools/import-identity.ts`/`tests/helpers/identity-fixture.ts`/reconciliation fixture — all absent. |
| 2 | Tests that cannot fail | PARTIAL | Implemented tests are meaningful (verified below). T06 asserts grants *written*, not that key ceiling *intersects/caps* membership — the spec's named "union vs intersect" negative control is not exercised. |
| 3 | Migrations | OK | No migration modified/deleted by this PR. `0002_identity.sql` pre-exists at base (`git tag --contains 5779c55` → none). Journal-style migration not reformatted. |
| 4 | Doctrine | **FAIL** | `removeMember` emits events with hardcoded actor `"identity-service"` and accepts no actor (D "event without actor"). `createOrganization` passes raw `creatorUserId` as actor, not `principal.id`. `createOrganization` returns `aiProviderApiKey` in the mutation `data` though §3 omits it. Importer/API-key auth perform writes with no events for principal/grant upserts. |
| 5 | Worker debris | FAIL (minor) | `console.error` in production handler (also a lint error). Dead code: `void now` (auth.ts:848), `separators` array `void`'d (import.ts:891), tautological `constantTimeEquals(digest, apiKeyDigest(rawKey))` (auth.ts:804). |
| 6 | Screenshots | **FAIL** | Zero screenshots; no `e2e/identity.spec.ts`; no Playwright run at any viewport. |
| 7 | Spans (ADR 0010) | **FAIL** | No new service function is an `Effect.fn`. `authenticateApiKey`/`importIdentity`/`createOrganization`/`removeMember`/`orgRouter` are plain `async function`s. No http.route/method/status/org/principal span attrs. No span-assertion test. `console.error` violates the no-console rule. |
| 8 | Re-run gates | **FAIL** | `bun run lint` exits 1 (`noConsole`). `bun test` unit gate: 2/29 red under default timeouts (T23 testTimeout 5s, T34 hookTimeout 10s). See output below. |

## Gate output

`bun run lint` → `Found 1 error` (exit 1):
```
apps/stellarc-api/src/auth-http.ts:60:4 lint/suspicious/noConsole  × Don't use console.
```

`bun --bun x vitest run --config vitest.config.ts` (unit gate, default timeouts) → **2 failed | 27 passed**:
```
× T34 createOrganization ... Error: Hook timed out in 10000ms (beforeEach → disposablePostgres/initdb)
× T23 identityImporter ... Error: Test timed out in 5000ms
```
Both pass only when `--hookTimeout 60000 --testTimeout 60000` is injected — the committed `vitest.config.ts` sets neither, so the gate is red as committed.

## Negative-control replay (T04, spec-named sabotage)

Sabotage `apiKeyDigest` `.digest("base64url")` → `.digest("hex")`:
```
RED: Expected "_XFTCL1gj0SA0KiG08gXBtO54oGur6MwtEckbhi8ch0"  Received "fd715308bd..."
```
Revert → GREEN (1 passed). Test is behavioral, not decorative.

## DEFECTS

1. `apps/stellarc-api/src/auth-http.ts:60` — `console.error` fails biome `noConsole` and ADR 0010. Remove it (return the sanitized 503 only); route diagnostics through tracing, not stderr.

2. `vitest.config.ts` — no `hookTimeout`/`testTimeout`/`maxWorkers`; `disposablePostgres()` (initdb) exceeds default 10s/5s, so `bun test` is red as committed (T23/T34). Add `testTimeout`/`hookTimeout` (≥60s) or `pool:'forks', maxWorkers:1` so the committed gate is green.

3. `apps/stellarc-api/src/identity-http.ts` (missing) — the 26 `IdentityApiGroup` endpoints in `packages/contracts/src/identity/http.ts` have no handlers. Implement every §3 endpoint (org/member/role/team/invitation/apikey/avatar/active-org) with error-union, auth, and txid envelope.

4. `packages/sync/src/identity-shapes.ts` (missing) — no live identity collections (§4). Members/Teams/Roles/Keys must read live collections, not REST snapshots.

5. `apps/stellarc-ui/...` + `e2e/identity.spec.ts` + `__screenshots__/` (missing) — no frozen-UI wiring or pixel evidence (§6). Sign-in→switch→Members/Teams/Roles/Keys must render identically to fork at all 4 viewports with real screenshots.

6. `packages/domain/src/identity/*.ts` — every service (`authenticateApiKey` auth.ts:790, `importIdentity` import.ts:1119, `createOrganization` mutations.ts:78, `removeMember` mutations.ts:158, `orgRouter` org-router.ts:33) must become `Effect.fn("Module.name")` with server/http/org/principal spans and a span-assertion test per path (T30/T31). Currently zero instrumentation.

7. `packages/domain/src/identity/mutations.ts:158` — `removeMember` has no actor parameter and hardcodes actor `"identity-service"` (line ~175). Accept the authenticated `principal.id` and emit events under it.

8. `packages/domain/src/identity/mutations.ts:124` — `createOrganization` passes raw `creatorUserId` as event actor; spec §2 requires `principal.id` (`human:<userId>`). Pass `humanPrincipalId(creatorUserId)`.

9. `packages/domain/src/identity/mutations.ts:161` — returns `aiProviderApiKey: null` in the mutation `data`; §3 OrganizationPublic omits it. Delete the field, and delete the `expect(result.data.aiProviderApiKey).toBeNull()` assertion in `tests/unit/identity-mutations.test.ts:95`.

10. `packages/domain/src/identity/auth.ts:790` — `authenticateApiKey` ignores `rate_limit_enabled`/`rate_limit_max`/`request_count`/`remaining`; no atomic increment, no rate-exhausted denial (T05 partial). Enforce rate counters atomically under concurrency.

11. `packages/domain/src/identity/import.ts:1119` — no preflight (column set/FKs/role-permission JSON/hash format/avatar MIME/duplicate source pairs) before writes; duplicate pairs would be silently dropped via `ON CONFLICT DO NOTHING`. Add preflight + abort with a useful report (T25).

12. `packages/domain/src/identity/import.ts:1251` — only `identity:organization-upserted` is emitted; member/role/team/principal/grant upsert events are missing. Also `eventCount` (line 1222) counts changed rows, not emitted events — the report is inaccurate. Emit sanitized events per affected org and correct `eventCount`.

13. `packages/domain/src/identity/auth.ts:804` — `constantTimeEquals(digest, apiKeyDigest(rawKey))` is tautological (always true; `digest` already equals `apiKeyDigest(rawKey)`), and the indexed `WHERE key = digest` lookup is the real comparison. Remove the dead re-verify; drop `void now` (line 848) and the `separators` dead array in `import.ts:891`.

14. `apps/stellarc-api/src/auth-http.ts:1` / `packages/domain/src/identity/mutations.ts:3` — unused imports (`Sql`, `OrganizationPublic`) flagged by lint. Remove.

15. `packages/domain/src/index.ts` (not modified) — new identity modules are not re-exported from the domain barrel; spec §5 lists this as MODIFY. Wire exports so the seam is reachable.

16. Spec/fork drift to reconcile (orchestrator): spec §2 organization table omits `work_enabled`, but the landed migration, contracts (`OrganizationPublic.workEnabled`), and this PR's code (`import.ts:971`, `mutations.ts:1398`) all include it. Confirm against fork `schema.ts` and correct the spec table rather than churning code.
