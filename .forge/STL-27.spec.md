# STL-27 — T13 reconciliation query canon and all-14 harness implementation spec

## 1. Scope and premise audit

Author the canonical SQL for reconciliation queries #1–#14, commit the canon under `docs/legacy/reconciliation/`, and build the harness that restores a pg_dump fixture into a disposable Postgres and runs all 14 queries with a per-query negative-control sabotage corpus, green in CI. The harness has two modes: **canon-proof mode** (synthetic golden source/destination pair restored from committed pg_dumps; proves each query's detection logic — verdicts labeled `canon-proof`, never reported as wave reconciliation PASS) and **live mode** (real merged importers run from the restored snapshot; the only source of reconciliation PASS, consumed by owning slices and STL-21's final gate). At this ticket's merge point live mode covers identity only (blocked-by STL-15); the rest report blocked. The orchestrator alone commits/merges/touches the tracker.

### Premise audit — code wins

- Gate checked: latest STL-27 triage is `pass` (2026-09-10T13:29:04Z).
- **Ticket claim "only #1–#12 are defined" is STALE.** Zero of the fourteen exist in this repo: the wave plan assigns #1–#12 to slices with one-line semantics only, and STL-14/15/16/17/18/20/21 all record "canonical inventory missing — obtain from orchestrator, never invent". No legacy inventory document exists anywhere in the checkout (filename search, per STL-15 §1). T13 **is** the obtaining mechanism: this spec authors the canon from the recorded per-slice obligations and thereby **supersedes** the missing-inventory blockers in STL-15 §7 T26–T28, STL-16 §7 T35–T37, STL-17 T26, STL-18 T10, STL-20 §7, STL-21 T17 — those suites unblock by executing the canon committed here. Provenance per query is recorded in the canon README; if an external legacy inventory exists outside the repo, the orchestrator must diff it against this canon before merge (caveat, not blocker).
- **`Blocked by: #15` TRUE.** STL-15 spec=pass, implement unmerged. All foundation/sibling code paths below reference provisional worktree `.forge/worktrees/stl-14-c29` at `6f122c8` (`tests/helpers/postgres.ts`, `packages/db/src/migrate.ts`, `vitest.integration.config.ts`, `.github/workflows/ci.yml`, `tests/gates.test.ts`). `dev` at `8d8c853` is docs/forge only — no `apps/`, `packages/`, `.github/`. **Rebind every path to merged code at implementation start.**
- **"Production snapshot" cannot be committed.** Redaction doctrine forbids committing production data (STL-14 §evidence: fork PNGs were provenance-only for exactly this reason). Split resolved explicitly: CI runs a **synthetic, snapshot-shaped** pg_dump committed under `tests/fixtures/reconciliation/`; the production-snapshot run is STL-21's wave-exit gate over an orchestrator-supplied redacted dump through the same harness. Claiming production parity from the synthetic fixture is prohibited.
- **#14 algorithm verified in fork** `apps/api/src/utils/verify-api-key.ts` @ `2504e645`: stored `apikey.key` = unpadded base64url of `SHA256(raw)`; `reference_id` is the owner FK, legacy nullable `user_id` is not canonical (STL-15 audit). Canon #14 uses this as ground truth.
- **Ledger asymmetry**: STL-15's `identity_import` records `(source_id, table_name, source_pk, digest)` with no `destination_id`; STL-17's `activity_import` adds `destination_id/destination_org/destination_seq`. Since every importer preserves source PKs verbatim (STL-15 §2 "preserve source identifiers"; PK-set comparison), canon #13 joins `ledger.source_pk → destination PK` and treats `destination_id` as a required column only where PK preservation does not hold. No sibling schema change is forced by this ticket; if a merged ledger neither preserves PKs nor records `destination_id`, the harness reports blocked (never green).
- `docs/legacy/` and `.github/workflows/` do not exist on `dev` — created/rebound here. CI discovery of the new suites is automatic through the existing `bun test` → vitest bridge (`tests/gates.test.ts` + `vitest.integration.config.ts` glob `tests/integration/**`); the CI job already installs `postgresql-15` (provides `pg_dump`/`pg_restore` — verify binaries at rebind). No CI file edit expected; add one only if the bridge does not exist post-STL-14.
- **STL-19 in flight** (spec running, escalated): canon #7 derives from the wave plan + STL-21's record of T5 semantics; rebind #7 if STL-19's merged relation contract differs.
- ADR 0010 applies to harness code: `Effect.fn` service methods, db spans without statement text, ≥1 span assertion with negative control, no `console.*`, no PII in attributes (synthetic fixture values only, but the rule holds for the production-snapshot path).

### OUT of scope / owner

- Importers for every legacy table and their per-query green: STL-15 (#1–#3), STL-16 (#4–#6), STL-17 (#8), STL-18 (#10), STL-19 (#7), STL-20 (#9/#11/#12). This slice authors queries and detection only.
- Final all-14 live run on a production snapshot + three consecutive clean imports: STL-21/T7 (uses this harness).
- Any production-table migration, domain service, HTTP endpoint, sync shape, or UI change: none — explicit zeros (§2–§4, §6).
- The re-issue **emitter** for #14's fallback arm (importer behavior, audit event append): STL-15. This slice defines the event contract and the proving query.
- Fixture generation for non-identity slices beyond what merged migrations allow: grows with the wave via the destination-golden generator, not by hand-editing dumps.

## 2. Tables, columns, events

**Production tables touched: none.** The harness reads restored fixture databases and merged Stellarc schemas; it never writes domain tables. Explicit zeros with invariants: no migration, no column change, no writes to `event`/`org_event_counter` in canon-proof mode (golden dumps are pre-materialized); live mode's events are the importers' own, unchanged.

Canon #13 reads the `<slice>_import` ledger family — as merged: `identity_import(source_id, table_name, source_pk, digest)`, `activity_import(+destination_id, destination_org, destination_seq)`, and siblings' ledgers per their specs (work/activity/repository/files/projects). The canon README records the ledger-contract precondition per query; absence ⇒ blocked.

**Event contract defined here, emitted by STL-15 (dependency):** `identity:apikey-reissued`, pluginId `identity`, schema_version 1, payload `{id, principalId, reason:"legacy-reissue"}`, org-scoped, not browser-visible — mirrors `identity:grant-upserted` privacy rules. #14's fallback arm requires exactly one such event per re-issued key. Until STL-15 implements it, #14's re-issue sabotage variant reports blocked-with-reason rather than green.

Harness instrumentation (ADR 0010): `Effect.fn("ReconcileCanon.<method>")` / `Effect.fn("ReconcileRunner.<method>")`; span `stellarc.reconcile.query` with attributes `stellarc.reconcile.query_id` (integer 1–14), `stellarc.reconcile.mode` (`canon-proof`|`live`), `stellarc.reconcile.verdict` (`green`|`red`|`blocked`), `stellarc.reconcile.violations` (count). No row data, hashes, ids of persons, or SQL text in attributes. DB access through the standard `@effect/sql` client wrapper.

## 3. HTTP API

**None.** The harness is test tooling + committed SQL, not a service. No endpoints, no request/response Schemas, no error union beyond process exit codes and a JSON report file: `reconciliation-report.json` (query id, mode, verdict, violation count, blocked reason; no PII) written to the test artifacts dir, exit nonzero on any `red` or on `all-blocked` (all-blocked is a harness failure, not success). This zero is the contract: any endpoint added in implementation is scope creep to bounce.

## 4. Sync shapes affected

**None.** No collections registered or changed; harness emits no shape traffic. The golden destination dump contains whatever merged shape projections exist, unmodified. Invariant: reconciliation never becomes a sync producer.

## 5. File manifest

Paths relative to repo root. "T0" mirrors reference `stl-14-c29@6f122c8` (rebind to merged STL-14); fork mirrors reference pinned `2504e645…` (`/home/rpw/repos/kaneo`). Every canon/sabotage SQL file carries a header: number, owner ticket, semantics source (sibling spec line), precondition tables, blocked-if.

| CREATE | Specific existing mirror |
|---|---|
| `docs/legacy/reconciliation/README.md` | `docs/plans/2026-09-08-kaneo-parity-waves.md` (governing-doc structure/tone); provenance + supersession table |
| `docs/legacy/reconciliation/queries/01-identity-core.sql` … `14-apikey-hash-audit.sql` (14 files) | fork `apps/api/src/database/schema.ts` (legacy identifiers/types ground truth); semantics per owning spec §7 |
| `tools/reconciliation/make-legacy-fixture.ts` | T0 `tests/helpers/postgres.ts` (initdb/pg_ctl/exec plumbing) + fork schema DDL |
| `tools/reconciliation/make-destination-golden.ts` | T0 `packages/db/src/migrate.ts` (migration application) + ledger-contract invariants |
| `tools/reconciliation/canon.ts` | T0 `packages/db/src/migrate.ts` (file-loading/validation service) |
| `tools/reconciliation/run.ts` | T0 `tests/helpers/postgres.ts`; report format per §3 |
| `tests/fixtures/reconciliation/manifest.json` | `apps/stellarc-ui/e2e/fixtures.ts` (deterministic-fixture declaration style) |
| `tests/fixtures/reconciliation/legacy-snapshot.pgdump` (generated, committed) | — produced by `make-legacy-fixture.ts` |
| `tests/fixtures/reconciliation/stellarc-destination-golden.pgdump` (generated, committed) | — produced by `make-destination-golden.ts` |
| `tests/fixtures/reconciliation/sabotage/01.sql` … `12.sql`, `13a.sql`, `13b.sql`, `14a.sql`, `14b.sql` (16 files) | none in repo; one named violation per file, derived from its query |
| `tests/unit/reconcile-canon.test.ts` | T0 `tests/unit/foundation.test.ts` |
| `tests/integration/reconciliation.test.ts` | T0 `tests/integration/foundation.test.ts` |

**40 CREATE total** (2 generated dumps among them). MODIFY: **none expected** — suite discovery rides the existing `tests/gates.test.ts`/vitest bridge; touch `.github/workflows/ci.yml` only if that bridge is absent or `pg_restore` is missing from the CI image at rebind. Do not add a parallel root runner or npm script outside existing gate names.

Query canon semantics (each file cites its source; violation-rows-returning form: empty = green):

| # | File / invariant | Semantics source |
|---|---|---|
| 1 | user/account/organization/organization_member/organization_role: PK-set equality + all-column fidelity | STL-15 §2/§7 T23 |
| 2 | team/team_member/invitation/user_avatar: same | STL-15 §2 |
| 3 | apikey: all columns, hash verbatim, enabled/rate-limit state preserved | STL-15 §2 |
| 4 | board + board_key_alias: all-column fidelity | STL-16 §1 |
| 5 | task→ticket: all columns incl. `PREFIX-seq` key, `description_history` jsonb byte-exact | STL-16 |
| 6 | zero orphan statuses: every ticket's effective status resolves to a column row or virtual taxonomy value | STL-16 §1 (fork's SET-NULL orphan pattern) |
| 7 | task_relation/task_follower/external_link/task_repo_item_link/milestone fidelity + acyclic directed relations | wave plan T5; rebind to STL-19 |
| 8 | activity accounting: legacy rows = comments + imported-provenance domain events, no loss/dup | STL-17 |
| 9 | asset rows ↔ S3 objects bijection + HTTP arm: every asset URL resolves 200 (SQL + declared harness hook) | STL-20 |
| 10 | repo/repo_issue/repo_pull_request/installation/grant/integration fidelity | STL-18 |
| 11 | grants apply to the same (principal, resource) both sides | STL-20 |
| 12 | cross-org isolation: no principal-readable row, grant, or shape leaks across orgs (SQL + HTTP hook) | STL-20 |
| 13 | id bijection: every legacy id (via ledger `source_pk`) maps to exactly one destination row and vice versa; `destination_id` required where PKs not preserved | this ticket; ledger contracts |
| 14 | every legacy apikey: stored hash verifies (fork algorithm, known-answer for fixture raws) or exactly one `identity:apikey-reissued` audit event — never neither, never both | this ticket; fork `verify-api-key.ts` |

Sabotage corpus: `13a` = two ledger entries claiming one destination id; `13b` = destination row with no ledger entry; `14a` = corrupt one stored hash encoding without event; `14b` = re-issue state without audit event. Others per their query (e.g. `06` = repoint one task's status to a deleted column slug).

## 6. UI surfaces

**None — zero UI diff.** No fork screen is touched, mounted, or re-baselined; the entire frozen-UI corpus (T0's four viewports and all sibling surfaces) must keep rendering identically because no UI file changes. Screenshot baselines are not regenerated by this slice under any circumstance.

## 7. Test plan — explicit RED and negative controls

Runs on real disposable Postgres (`tests/helpers/postgres.ts`), real `pg_restore`/`pg_dump`, stock vitest bridge. Missing canon/fixture is only the initial RED; once present, each row also has an assertion RED via its sabotage. One-variable sabotage per run, restore, rerun GREEN (record exits + failing assertion per ID).

| ID | Test / RED condition before implementation | Negative control that must turn it RED |
|---|---|---|
| R01 | Canon corpus valid: exactly 14 query files, ids unique, headers complete, 16 sabotage files present, manifest counts match. RED: any file absent | Delete one canon file |
| R02 | `legacy-snapshot.pgdump` restores via `pg_restore` into disposable PG; pinned fork table set + manifest row counts present. RED: fixture absent | Remove one table/row from fixture |
| R03 | Fixture freshness: regenerate both dumps → logical equivalence with committed copies. RED: generators absent | Mutate committed dump by one row |
| R04 | Destination golden restores; schema matches merged migrations; unmerged-slice queries report `blocked` (never green/red); `all-blocked` ≠ success | Hide a merged ledger table → dependent query flips green→blocked and the meta-assertion fails |
| R05–R16 | Per query #1–#12: `canon-proof` green on golden pair (zero violation rows). RED: query file absent (reported missing ≠ green) | Apply its sabotage file → ≥1 violation row, correct query id |
| R17 | Query #13 bijection: green on golden; red under `13a` AND independently under `13b` | Apply 13a, then 13b separately |
| R18 | Query #14 preserved-hash arm green; `14a` corrupt-hash sabotage red | Apply 14a |
| R19 | #14 known-answer: manifest-recorded fixture raws digest via fork algorithm (unpadded base64url SHA256) match stored hashes. RED: wrong algorithm | Switch digest to hex/padded |
| R20 | #14 re-issue arm: `14b` (re-issue without audit event) red; with contract event green — blocked-with-reason until STL-15 emits it | Apply 14b |
| R21 | Live mode: real merged STL-15 importer runs from restored snapshot; #1–#3 plus #13/#14 identity subchecks green. RED: importer absent (unexpected — blocked-by guarantees merge) | Apply `13b` to the live destination |
| R22 | Spans: `stellarc.reconcile.query` per query with id/mode/verdict/violations; db.* spans, no SQL text/PII/console. RED: instrumentation absent | Remove one `Effect.fn` wrapper or add a `console.*` |
| R23 | Report/exit contract: JSON report written, nonzero exit on red or all-blocked, no PII | Flip verdict aggregation |
| R24 | Gate discovery: new suites execute under `bun test` bridge; intentional assertion failure fails root gate | Sabotage an assertion; remove suite from glob |

**Reconciliation ownership:** this slice owns the canon + detection for **all 14**; per-query live green belongs to the owning slice (§1 table); STL-21 owns the final all-14 production-snapshot gate. No `reconciliation: pass` is ever claimed from canon-proof mode.

## 8. Suggested vertical build order

1. Rebind to merged STL-14/STL-15; confirm bridge/CI, `pg_restore` availability, ledger schemas as merged. Resolve any ledger/destination_id deviation via orchestrator ruling before building on it.
2. R01 RED → canon README + 14 query files (start #13/#14, the ticket's own definitions) → corpus validation GREEN.
3. R02/R03 RED → `make-legacy-fixture.ts` + committed dumps → restore/freshness GREEN.
4. R04 RED → destination-golden generator + runner with blocked semantics → GREEN (identity coverage; blocked elsewhere).
5. Thinnest end-to-end: restore golden → #13 green → `13a`/`13b` red. Then #14 with known-answer + both arms. Then #1–#12 canon from sibling semantics.
6. R21 live mode against the real merged identity importer; R22–R24 spans/report/gates.
7. Unblocking pass: confirm STL-15/16/17/18/20/21 blocked suites can consume the canon (paths/ids stable), record in README.
8. Hand off for adversarial review; orchestrator commits, runs clean-worktree gates, merges. Canon is not amended post-review without a supersession entry.
