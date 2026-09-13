# Legacy reconciliation canon — STL-27 (T13)

Canonical SQL for reconciliation queries #1–#14, plus the harness that restores a
committed pg_dump fixture pair into a disposable Postgres and runs all 14 queries
with a per-query negative-control sabotage corpus.

## Purpose and modes

The harness has two modes:

- **canon-proof** — a synthetic golden source/destination pair (committed pg_dumps under
  `tests/fixtures/reconciliation/`) proves each query's *detection logic*. Verdicts are
  labelled `canon-proof` and are **never** reported as wave reconciliation PASS.
- **live** — real merged importers run against the restored snapshot. At this ticket's
  merge point live mode covers identity only (blocked-by STL-15, importer unmerged); the
  rest report `blocked`. The only source of reconciliation PASS for the wave; STL-21 owns
  the final all-14 production-snapshot gate.

## Provenance and supersession

The wave plan (`docs/plans/2026-09-08-kaneo-parity-waves.md`) assigned #1–#12 to slices with
one-line semantics only, and STL-14/15/16/17/18/20/21 all recorded "canonical inventory
missing — obtain from orchestrator, never invent". No legacy inventory document existed in
the checkout. **T13 is the obtaining mechanism**: this canon authors the query definitions
from the recorded per-slice obligations and thereby **supersedes** the missing-inventory
blockers in STL-15 §7 T26–T28, STL-16 §7 T35–T37, STL-17 T26, STL-18 T10, STL-20 §7,
STL-21 T17. Those suites unblock by executing the canon committed here.

Per-query provenance:

| # | File | Owner | Semantics source | Precondition (destination side) |
|---|---|---|---|---|
| 1 | `01-identity-core.sql` | STL-15 | STL-15 §2/§7 T23 | user/account/organization/organization_member/organization_role |
| 2 | `02-identity-team.sql` | STL-15 | STL-15 §2 | team/team_member/invitation/user_avatar |
| 3 | `03-apikey.sql` | STL-15 | STL-15 §2 | apikey |
| 4 | `04-board.sql` | STL-16 | STL-16 §1 | board, board_key_alias |
| 5 | `05-ticket.sql` | STL-16 | STL-16 (task→ticket, PREFIX-seq, description_history byte-exact) | ticket |
| 6 | `06-status.sql` | STL-16 | STL-16 §1 (SET-NULL orphan pattern) | ticket, status |
| 7 | `07-relations.sql` | STL-19 | wave plan T5 (provisional — rebind on STL-19 merge) | entity_link, milestone |
| 8 | `08-activity.sql` | STL-17 | STL-17 (comment store + domain events) | comment, event, activity_import |
| 9 | `09-asset.sql` | STL-20 | STL-20 (asset ↔ S3 bijection) | asset |
| 10 | `10-repository.sql` | STL-18 | STL-18 | repo/repo_issue/repo_pull_request/installation/grant/integration |
| 11 | `11-grants.sql` | STL-20 | STL-20 (same (principal, resource)) | resource_grant |
| 12 | `12-isolation.sql` | STL-20 | STL-20 (cross-org isolation) | resource_grant, board, repo, asset, ticket |
| 13 | `13-id-bijection.sql` | STL-27 | this ticket + STL-15 identity_import ledger | identity_import + destination identity tables |
| 14 | `14-apikey-hash-audit.sql` | STL-27 | this ticket + fork verify-api-key.ts @2504e645 | apikey, principal, event, org_event_counter |

### Ledger contract precondition

Canon #13 reads the `<slice>_import` ledger family — as merged:
`identity_import(source_id, table_name, source_pk, digest)` and
`activity_import(+destination_id, destination_org, destination_seq)`. Identity importers
preserve source PKs verbatim (STL-15 §2), so #13 joins `ledger.source_pk → destination PK`.
`destination_id` is required only where PK preservation does not hold. **If a merged ledger
neither preserves PKs nor records `destination_id`, the harness reports `blocked` (never green).**

### External legacy inventory caveat (not a blocker)

If a legacy inventory document exists outside this repo, the orchestrator must diff it
against this canon before merge. Provenance per query is recorded in the query headers.

## File layout

```
docs/legacy/reconciliation/
  README.md
  queries/01-…14-….sql        # canonical, violation-rows-returning (empty = green)
tools/reconciliation/
  canon.ts                    # hash algorithm, fixture DDL/seed, corpus loader/validator
  make-legacy-fixture.ts      # -> tests/fixtures/reconciliation/legacy-snapshot.pgdump
  make-destination-golden.ts  # -> tests/fixtures/reconciliation/stellarc-destination-golden.pgdump
  run.ts                      # restore + run + classify + report + spans + exit code
tests/fixtures/reconciliation/
  manifest.json               # per-query metadata, preconditions, sabotages, known-answers
  legacy-snapshot.pgdump          # generated, committed
  stellarc-destination-golden.pgdump # generated, committed
  sabotage/01…14b.sql         # one named violation each
tests/unit/reconcile-canon.test.ts
tests/integration/reconciliation.test.ts
```

## Report and exit contract

`run.ts` writes `reconciliation-report.json` (query id, mode, verdict, violation count,
blocked reason — no PII) to the artifacts dir, and exits nonzero on any `red` or on
`all-blocked` (all-blocked is a harness failure, not success).

## Regenerating the fixtures

```sh
bun run tools/reconciliation/make-legacy-fixture.ts
bun run tools/reconciliation/make-destination-golden.ts
```

Both dumps are committed. Fixture freshness (R03) proves regeneration is logically
equivalent to the committed copies. **Claiming production parity from the synthetic
fixture is prohibited** (redaction doctrine, STL-14 §evidence).

## Instrumentation (ADR 0010)

Span `stellarc.reconcile.query` with attributes `stellarc.reconcile.query_id` (1–14),
`stellarc.reconcile.mode` (`canon-proof`|`live`), `stellarc.reconcile.verdict`
(`green`|`red`|`blocked`), `stellarc.reconcile.violations` (count). No row data, hashes,
person ids, or SQL text in attributes. No `console.*` in harness service code.
