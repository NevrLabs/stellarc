# STL-31 — review cycle 2 (adversarial)

## Verdict

**PASS**

## Per-item audit

| # | Item | Verdict |
|---|---|---|
| 1 | Spec compliance | PASS. `0002_identity.sql` creates all 15 tables (§2, incl. `work_enabled`, nullable `team.updated_at`, `ON DELETE SET NULL` on `team.parent_team_id`, partial `principal` unique, deferred composite uniques absent). `tables.ts` (15 snake_case rows), `events.ts` (17 events, `IDENTITY_SCHEMA_VERSION=1`, no secret/byte fields), `http.ts` (26 `HttpApiEndpoint`s in `HttpApiGroup.make("identity")`, `IdentityError` 7 tags / 5 Conflict codes), `auth-schemas.ts` (3 Better Auth routes, Schemas only), domain `index.ts` (4 `Context.Tag`, no Layer/SQL), `migrate.ts` version-list MODIFY, integration + unit tests. No handlers, no mounting, no importer, no events emitted. Deviation (benign, see notes): `Schema.Uint8Array` used where spec names `Uint8ArrayFromArray` — effect 3.22.0 exports only `Uint8Array` (array→bytes transform, exactly the intended semantics), no `Uint8ArrayFromArray` symbol exists. |
| 2 | Tests that cannot fail | PASS. Every new test has a nameable red-maker, replays of negative controls below. No decorative tests. |
| 3 | Migrations | PASS. Only `0002_identity.sql` is new; `0001_foundation.sql` bytes untouched (absent from diff). No shipped migration modified/deleted (`git tag --contains` shows only `archive/*` + `wip-*`). No journal reformat. |
| 4 | Doctrine | PASS. No direct SQL in app code (migration DDL + advisory-lock runner are T0's existing pattern, not D12 writes). No events (T1a emits none), no mutations, no model calls, no hardcoded hex/token (lock id `7414030914` is pre-existing). |
| 5 | Worker debris | PASS. No `console.*`, TODO/FIXME/XXX, `@ts-ignore`, debugger, or commented-out code in any new file. |
| 6 | Screenshots | PASS. Zero UI files touched (diff is 11 files, none under `apps/`), no Playwright PNGs regenerated. Spec §6 "no screen may change" is satisfied by construction. |
| 7 | Spans (ADR 0010) | PASS. `applyMigration` is `Effect.fn("stellarc.migrate.apply")`; only span attribute is `stellarc.migration.version` (comma-joined, no PII). No handlers/endpoint spans (declared only). D1 asserts the span and goes RED when the annotation is removed (verified). No `console.*`. |
| 8 | Gates re-run | PASS (isolated worktree @ `1c5c58e`). `bun install --frozen-lockfile` ✓, `bun run lint` ✓ (954 files), `bun run typecheck` ✓, unit 15/15 ✓, integration `identity-migration` 8/8 ✓. NOTE: integration tests exceed vitest's 30s default timeout on this disk (disposable-PG `initdb` is slow); pre-existing `foundation.test.ts` T13 times out identically — environmental, not a code defect. All pass with `--testTimeout=120000`. |

## Negative controls replayed

- **SPAN (D1)**: removed `Effect.annotateCurrentSpan("stellarc.migration.version", …)` from `applyMigration` → `expect(span?.attributes["stellarc.migration.version"]).toBe("0001_foundation,0002_identity")` went RED (`expected undefined`). Restored → GREEN. Behavioral red, not a compile error.
- I1/I4/I5/I6/I7 are parameterized against hardcoded §2 expectations in the test file (independent of the SQL file); each has a concrete red-maker (drop column / retype / change ON DELETE / drop CHECK / replace `lower(slug)` unique).

## DEFECTS

None blocking.

## Notes (non-blocking)

1. **`tests/integration/foundation.test.ts` modified** (T06 span version → `"0001_foundation,0002_identity"`; migration-row count → 2) — not in the §5 manifest, but an unavoidable consequence of the in-scope `migrate.ts` change (gates go red otherwise). Correct as written; orchestrator/spec should acknowledge the out-of-manifest edit.
2. **`.forge-question.md` referenced in the c2 commit message** does not exist in the PR or tree — dangling reference; carry the `Uint8Array` disposition into the ticket/comment if the orchestrator needs it.
3. **`Permission` empty-array edge**: `Schema.Array(Literal)` accepts `{board:[]}` (empty action array), whereas §3's "Array<nonempty action>" could read as non-empty; the impl treats "nonempty" as per-element (satisfied by vocabulary Literals) and preserves "empty-ceiling" (`{}`) for `ApiKeyPublic`. Defensible; flag for T1 if strictness is wanted.
