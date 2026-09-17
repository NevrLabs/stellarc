# STL-31 — review cycle 4 (adversarial)

## Verdict

**PASS**

## Per-item audit

| # | Item | Verdict |
|---|---|---|
| 1 | Spec compliance | PASS. `0002_identity.sql` creates all 15 tables in FK order (§2, incl. `work_enabled`, nullable `team.updated_at`, `ON DELETE SET NULL` on `team.parent_team_id`, `principal` kind CHECK + human/apikey oracle CHECK, partial unique `(user_id) WHERE kind='human'`, deferred composite uniques absent). `tables.ts` (15 snake_case rows), `events.ts` (17 payloads, `IDENTITY_SCHEMA_VERSION=1`, no secret/byte fields), `http.ts` (26 `HttpApiEndpoint`s in `HttpApiGroup.make("identity")`, `IdentityError` 7 tags / 5 Conflict codes, `Permission` vocabulary-bound), `auth-schemas.ts` (3 Better Auth shapes, Schemas only), domain `index.ts` (4 `Context.Tag`, no Layer/SQL). No handlers, no mounting, no importer, no events emitted. `Schema.Uint8Array` stands in for the spec's non-existent `Uint8ArrayFromArray` (documented; U6 pins array→bytes semantics). |
| 2 | Tests that cannot fail | PASS. Each new test has a nameable red-maker; I1–I7/U1–U6 hardcode §2 expectations independent of the source. Replayed span negative control below (red → green). |
| 3 | Migrations | PASS. Only `0002_identity.sql` is new (A); `0001_foundation.sql` bytes untouched (empty diff). No shipped migration modified/deleted. No journal reformat. |
| 4 | Doctrine | PASS. No direct SQL writes in app code (migration DDL + advisory-lock runner = existing T0 pattern). No events emitted, no mutations, no model calls, no hardcoded hex/token (lock id `7414030914` pre-existing). |
| 5 | Worker debris | PASS. No `console.*`, TODO/FIXME/XXX, `@ts-ignore`, `debugger`, or commented-out code in any new file. |
| 6 | Screenshots | PASS. Zero UI files touched (all 11 files under `packages/`/`tests/`, none under `apps/`), no Playwright PNGs regenerated. Spec §6 "no screen may change" satisfied by construction. |
| 7 | Spans (ADR 0010) | PASS. `applyMigration` is `Effect.fn("stellarc.migrate.apply")`; sole attribute `stellarc.migration.version` (comma-joined, no PII). Endpoints are declared-only (no spans expected yet). D1 asserts the span and goes RED when the annotation is removed (verified). No `console.*`. |
| 8 | Gates re-run | PASS (isolated worktree `/tmp/stl31-review` @ `65ea06a`). `bun install --frozen-lockfile` ✓, `bun run lint` ✓ (954 files), `bun run typecheck` ✓, unit 15/15 ✓, integration `identity-migration` 8/8 ✓. NOTE: `bun test` bridge reports the integration gate red only because `foundation.test.ts` T08 + shape-span tests exceed vitest's 30s `testTimeout` (disposable-PG `initdb` is slow on this disk) and the 300s bridge kill fires. Pre-existing environmental, not a code defect: full integration suite is 51/51 green with `--testTimeout=120000`. |

## Negative control replayed

- **SPAN (D1)**: removed `Effect.annotateCurrentSpan("stellarc.migration.version", …)` from `applyMigration` → `expect(span?.attributes["stellarc.migration.version"]).toBe("0001_foundation,0002_identity")` went RED (`expected undefined`). Restored → GREEN. Behavioral red, not a compile error.

## DEFECTS

None blocking (0).

## Notes (non-blocking)

1. **`tests/integration/foundation.test.ts` modified** (T06 span version → `"0001_foundation,0002_identity"`; migration-row count → 2) — out of the §5 manifest, but an unavoidable consequence of the in-scope `migrate.ts` change. Correct as written.
2. **`.forge-question.md` referenced in the c2 commit message** does not exist on disk (gitignored, never persisted) — dangling reference; the `Uint8Array` disposition is instead carried in the commit body and U6 test comment.
3. **Runtime-table fork parity** (`session`/`verification`): fork `schema.ts` gives `verification.updated_at` a `.defaultNow()` default and defines `session_userId_idx` / `verification_identifier_idx` indexes; `0002_identity.sql` omits all three. §2's runtime-table spec lists neither the default nor the indexes, so this matches the spec text — but if "retained verbatim from the pin" is meant to cover the runtime tables too, T1 should reconcile these three.
